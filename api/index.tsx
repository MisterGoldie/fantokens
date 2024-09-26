import { Button, Frog } from 'frog';
import { handle } from 'frog/vercel';
import { neynar } from 'frog/middlewares';
import { gql, GraphQLClient } from "graphql-request";

const AIRSTACK_API_KEY = process.env.AIRSTACK_API_KEY || '';
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';
const MOXIE_API_URL = "https://api.studio.thegraph.com/query/23537/moxie_protocol_stats_mainnet/version/latest";

if (!AIRSTACK_API_KEY) {
  console.warn('AIRSTACK_API_KEY is not set in the environment variables');
}

if (!NEYNAR_API_KEY) {
  console.warn('NEYNAR_API_KEY is not set in the environment variables');
}   

type TextBoxProps = {
  label: string;
  value: string | number;
};

export const app = new Frog({
  basePath: '/api',
  imageOptions: { width: 1200, height: 628 },
  imageAspectRatio: '1.91:1',
  title: 'Farcaster Fan Token Tracker',
  hub: AIRSTACK_API_KEY ? {
    apiUrl: "https://hubs.airstack.xyz",
    fetchOptions: {
      headers: {
        "x-airstack-hubs": AIRSTACK_API_KEY,
      }
    }
  } : undefined
});

app.use(
  neynar({
    apiKey: NEYNAR_API_KEY,
    features: ['interactor', 'cast'],
  })
);

interface ProfileInfo {
  primaryDomain: {
    name: string;
    avatar: string;
  };
  farcasterSocial: {
    profileName: string;
    profileDisplayName: string;
    profileHandle: string;
    profileImage: string;
    profileBio: string;
    followerCount: number;
    followingCount: number;
    farcasterScore: {
      farScore: number;
    };
  };
}

async function getProfileInfo(fid: string): Promise<ProfileInfo | null> {
  const AIRSTACK_API_URL = 'https://api.airstack.xyz/gql';
  const graphQLClient = new GraphQLClient(AIRSTACK_API_URL, {
    headers: {
      'Authorization': AIRSTACK_API_KEY,
    },
  });

  const query = gql`
    query GetProfileInfo($identity: Identity!) {
      Wallet(input: { identity: $identity }) {
        primaryDomain {
          name
          avatar
        }
      }
      farcasterSocials: Socials(
        input: {
          filter: { identity: { _eq: $identity }, dappName: { _eq: farcaster } }
          blockchain: ethereum
          order: { followerCount: DESC }
        }
      ) {
        Social {
          profileName
          profileDisplayName
          profileHandle
          profileImage
          profileBio
          followerCount
          followingCount
          farcasterScore {
            farScore
          }
        }
      }
    }
  `;

  const variables = { identity: `fc_fid:${fid}` };

  try {
    const data = await graphQLClient.request<any>(query, variables);
    console.log('Profile API response data:', JSON.stringify(data, null, 2));

    if (!data.Wallet || !data.farcasterSocials.Social[0]) {
      throw new Error('Incomplete data in the response');
    }

    const wallet = data.Wallet;
    const social = data.farcasterSocials.Social[0];

    return {
      primaryDomain: wallet.primaryDomain,
      farcasterSocial: social,
    };
  } catch (error) {
    console.error('Error in getProfileInfo:', error);
    return null;
  }
}

async function getFanTokenAddressFromFID(fid: string): Promise<any> {
  const graphQLClient = new GraphQLClient(MOXIE_API_URL);

  const query = gql`
    query MyQuery($symbol_starts_with: String) {
      subjectTokens(where: {symbol_starts_with: $symbol_starts_with}) {
        address: id
        name
        symbol
        decimals
      }
    }
  `;

  const variables = {
    symbol_starts_with: `fid:${fid}`
  };

  try {
    const data = await graphQLClient.request<any>(query, variables);
    console.log('Fan token address query response:', JSON.stringify(data, null, 2));

    if (!data.subjectTokens || data.subjectTokens.length === 0) {
      console.log(`No fan token found for FID: ${fid}`);
      return null;
    }

    return data.subjectTokens[0];
  } catch (error) {
    console.error('Error fetching fan token address from Moxie API:', error);
    return null;
  }
}

async function getFanTokenInfo(fid: string): Promise<any> {
  const graphQLClient = new GraphQLClient(MOXIE_API_URL);

  // First, get the fan token address from FID
  const tokenAddressInfo = await getFanTokenAddressFromFID(fid);
  
  if (!tokenAddressInfo) {
    console.log(`No fan token found for FID: ${fid}`);
    return null;
  }

  const query = gql`
    query MyQuery($fanTokenAddress: ID) {
      subjectTokens(where: { id: $fanTokenAddress }) {
        currentPriceInMoxie
        id
        name
        symbol
        portfolio {
          balance
          user {
            id
          }
        }
      }
    }
  `;

  const variables = {
    fanTokenAddress: tokenAddressInfo.address.toLowerCase()
  };

  try {
    const data = await graphQLClient.request<any>(query, variables);
    console.log('Moxie API response:', JSON.stringify(data, null, 2));

    if (!data.subjectTokens || data.subjectTokens.length === 0) {
      console.log(`No fan token information found for address: ${tokenAddressInfo.address}`);
      return null;
    }

    const tokenInfo = data.subjectTokens[0];

    return {
      name: tokenInfo.name,
      symbol: tokenInfo.symbol,
      currentPriceInMoxie: parseFloat(tokenInfo.currentPriceInMoxie),
      holdersCount: tokenInfo.portfolio.length
    };
  } catch (error) {
    console.error('Error fetching fan token info from Moxie API:', error);
    return null;
  }
}

app.frame('/owned-tokens', async (c) => {
  console.log('Entering /owned-tokens frame');
  const { fid } = c.frameData || {};

  console.log(`FID: ${fid}`);

  if (!fid) {
    console.error('No FID found in frameData');
    return c.res({
      image: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <h1 style={{ fontSize: '48px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Error: No FID</h1>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>
      ]
    });
  }

  let profileInfo = await getProfileInfo(fid.toString());
  console.log('Profile info:', JSON.stringify(profileInfo, null, 2));

  if (!profileInfo) {
    console.error('Failed to retrieve profile info');
    return c.res({
      image: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <h1 style={{ fontSize: '48px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Error: Failed to retrieve profile info</h1>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>
      ]
    });
  }

  const moxieGraphQLClient = new GraphQLClient(MOXIE_API_URL);

  const userPortfolioQuery = gql`
    query GetUserPortfolio($fid: String!) {
      users(where: { id: $fid }) {
        portfolio {
          balance
          buyVolume
          sellVolume
          subjectToken {
            name
            symbol
          }
        }
      }
    }
  `;

  const userPortfolioVariables = {
    fid: fid.toString()
  };

  console.log('Moxie API URL:', MOXIE_API_URL);
  console.log('GraphQL Query:', userPortfolioQuery);
  console.log('Query Variables:', JSON.stringify(userPortfolioVariables, null, 2));

  try {
    console.log('Sending request to Moxie API...');
    const portfolioData = await moxieGraphQLClient.request<any>(userPortfolioQuery, userPortfolioVariables);
    console.log('Moxie API Response:', JSON.stringify(portfolioData, null, 2));

    if (!portfolioData.users || portfolioData.users.length === 0) {
      console.warn('No user data found in Moxie API response');
      return c.res({
        image: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
            <h1 style={{ fontSize: '48px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>No fan tokens found for this user</h1>
          </div>
        ),
        intents: [
          <Button action="/">Back</Button>
        ]
      });
    }

    const ownedTokens = portfolioData.users[0]?.portfolio || [];

    return c.res({
      image: (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          width: '1200px', 
          height: '628px', 
          backgroundImage: 'url(https://bafybeie6dohh2woi4zav4xj24fmqo57ygf2f22yv42oaqjyl3zlpxlo4ie.ipfs.w3s.link/Untitled%20542.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          color: 'white',
          fontFamily: 'Arial, sans-serif',
          padding: '40px',
          boxSizing: 'border-box',
        }}>
          <div style={{
            width: '150px',
            height: '150px',
            borderRadius: '50%',
            overflow: 'hidden',
            backgroundColor: '#FFA500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            alignSelf: 'center',
          }}>
            <img 
              src={profileInfo?.farcasterSocial?.profileImage || '/api/placeholder/150/150'} 
              alt="Profile" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <h1 style={{ fontSize: '48px', color: '#FFD700', marginBottom: '20px', textAlign: 'center' }}>
            Your Owned Fan Tokens
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', flex: 1 }}>
            {ownedTokens.length > 0 ? (
              ownedTokens.map((token: any, index: number) => (
                <div key={index} style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  marginBottom: '20px', 
                  backgroundColor: 'rgba(255,255,255,0.8)',
                  padding: '10px',
                  borderRadius: '10px',
                  color: '#000000'
                }}>
                  <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {token.subjectToken.name} ({token.subjectToken.symbol})
                  </p>
                  <p style={{ fontSize: '20px' }}>
                    Balance: {parseFloat(token.balance) / 1e18} tokens
                  </p>
                  <p style={{ fontSize: '20px' }}>
                    Buy Volume: {parseFloat(token.buyVolume) / 1e18} tokens
                  </p>
                  <p style={{ fontSize: '20px' }}>
                    Sell Volume: {parseFloat(token.sellVolume) / 1e18} tokens
                  </p>
                </div>
              ))
            ) : (
              <p style={{ fontSize: '24px', color: '#FFFFFF', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: '20px', borderRadius: '10px' }}>No owned fan tokens found</p>
            )}
          </div>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>,
        <Button action="/yourfantoken">Your Fan Token</Button>,
      ]
    });
  } catch (error) {
    console.error('Error fetching data from Moxie API:', error);
    
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error('Error details:', error.stack);
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else {
      errorMessage = 'An unknown error occurred';
    }

    return c.res({
      image: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <h1 style={{ fontSize: '36px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Error fetching fan tokens: {errorMessage}</h1>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>
      ]
    });
  }
});


app.frame('/', (c) => {
  return c.res({
    image: (
      <div style={{
        width: '1200px',
        height: '628px',
        backgroundColor: '#1A1A1A',
        color: 'white',
        fontFamily: 'Arial, sans-serif',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <h1 style={{ fontSize: '48px', color: '#FFD700' }}>
          Fan Token Tracker
        </h1>
      </div>
    ),
    intents: [
      <Button action="/profile">Your Profile</Button>,
    ],
  });
});

app.frame('/profile', async (c) => {
  console.log('Entering /profile frame');
  const { fid } = c.frameData || {};

  console.log(`FID: ${fid}`);

  if (!fid) {
    console.error('No FID found in frameData');
    return c.res({
      image: (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <h1 style={{ fontSize: '48px', marginBottom: '20px', color: 'white', textAlign: 'center' }}>Error: No FID</h1>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>
      ]
    });
  }

  const profileInfo = await getProfileInfo(fid.toString());

  return c.res({
    image: (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        width: '1200px', 
        height: '628px', 
        backgroundColor: '#1A1A1A',
        color: 'white',
        fontFamily: 'Arial, sans-serif',
        padding: '40px',
        boxSizing: 'border-box',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '30px' }}>
          <p style={{ fontSize: '48px', color: '#FFD700', textAlign: 'center', marginBottom: '10px' }}>
            {profileInfo?.farcasterSocial.profileDisplayName || 'Unknown User'}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '80%' }}>
          <h1 style={{ fontSize: '36px', color: '#FFD700', marginBottom: '20px', textAlign: 'center' }}>
            Profile Information
          </h1>
          {profileInfo ? (
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: '24px', color: '#BDBDBD', textAlign: 'center', alignItems: 'center' }}>
              <p style={{ marginBottom: '15px', maxWidth: '80%' }}>Bio: {profileInfo.farcasterSocial.profileBio || 'No bio available'}</p>
              <p style={{ marginBottom: '15px' }}>Followers: {profileInfo.farcasterSocial.followerCount}</p>
              <p style={{ marginBottom: '15px' }}>Following: {profileInfo.farcasterSocial.followingCount}</p>
              <p style={{ marginBottom: '15px' }}>FarScore: {profileInfo.farcasterSocial.farcasterScore?.farScore?.toFixed(2) || 'N/A'}</p>
              {profileInfo.primaryDomain && (
                <p style={{ marginBottom: '15px' }}>Primary Domain: {profileInfo.primaryDomain.name}</p>
              )}
            </div>
          ) : (
            <p style={{ fontSize: '24px', color: '#BDBDBD', textAlign: 'center' }}>No profile information found</p>
          )}
        </div>
      </div>
    ),
    intents: [
      <Button action="/">Back</Button>,
      <Button action="/yourfantoken">Your Fan Token</Button>,
    ]
  });
});

app.frame('/yourfantoken', async (c) => {
  console.log('Entering /yourfantoken frame');
  const { fid } = c.frameData || {};

  console.log(`FID: ${fid}`);

  if (!fid) {
    console.error('No FID found in frameData');
    return c.res({
      image: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#87CEEB' }}>
          <h1 style={{ fontSize: '48px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Error: No FID</h1>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>
      ]
    });
  }

  let tokenInfo = await getFanTokenInfo(fid.toString());
  let profileInfo = await getProfileInfo(fid.toString());

  function TextBox({ label, value }: TextBoxProps) {
    return (
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        padding: '10px',
        margin: '5px',
        borderRadius: '10px',
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '230px',
        height: '100px'
      }}>
        <div style={{ fontWeight: 'bold' }}>{label}</div>
        <div>{value}</div>
      </div>
    );
  }

  return c.res({
    image: (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1200px', 
        height: '628px', 
        backgroundImage: 'url(https://bafybeidaqyqtdynorxghei3q7dceyb23rlhd5txkwhj7hx37dwhidb4yyy.ipfs.w3s.link/Frame%2064%20(1).png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        fontFamily: 'Arial, sans-serif',
        color: '#000000',
        padding: '20px',
        boxSizing: 'border-box',
      }}>
        <div style={{
          width: '150px',
          height: '150px',
          borderRadius: '50%',
          overflow: 'hidden',
          backgroundColor: '#FFA500',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '20px',
        }}>
          <img 
            src={profileInfo?.farcasterSocial?.profileImage || '/api/placeholder/150/150'} 
            alt="Profile" 
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
        }}>
          <TextBox label="Current Price" value={tokenInfo ? tokenInfo.currentPriceInMoxie.toFixed(2) : 'N/A'} />
          <TextBox label="FID" value={fid.toString()} />
          <TextBox label="Holders" value={tokenInfo ? tokenInfo.holdersCount.toString() : 'N/A'} />
          <TextBox label="Name" value={profileInfo?.farcasterSocial?.profileDisplayName || 'N/A'} />
        </div>
      </div>
    ),
    intents: [
      <Button action="/">Back</Button>,
      <Button action="/yourfantoken">Refresh</Button>,
      <Button action="/owned-tokens">Owned</Button>,
    ]
  });
});


app.frame('/owned-tokens', async (c) => {
  console.log('Entering /owned-tokens frame');
  const { fid } = c.frameData || {};

  console.log(`FID: ${fid}`);

  if (!fid) {
    console.error('No FID found in frameData');
    return c.res({
      image: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <h1 style={{ fontSize: '48px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Error: No FID</h1>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>
      ]
    });
  }

  let profileInfo = await getProfileInfo(fid.toString());
  console.log('Profile info:', JSON.stringify(profileInfo, null, 2));

  if (!profileInfo) {
    console.error('Failed to retrieve profile info');
    return c.res({
      image: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <h1 style={{ fontSize: '48px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Error: Failed to retrieve profile info</h1>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>
      ]
    });
  }

  const moxieGraphQLClient = new GraphQLClient(MOXIE_API_URL);

  const userPortfolioQuery = gql`
    query GetUserPortfolio($fid: String!) {
      users(where: { id: $fid }) {
        portfolio {
          balance
          buyVolume
          sellVolume
          subjectToken {
            name
            symbol
          }
        }
      }
    }
  `;

  const userPortfolioVariables = {
    fid: fid.toString()
  };

  console.log('Moxie API URL:', MOXIE_API_URL);
  console.log('GraphQL Query:', userPortfolioQuery);
  console.log('Query Variables:', JSON.stringify(userPortfolioVariables, null, 2));

  try {
    console.log('Sending request to Moxie API...');
    const portfolioData = await moxieGraphQLClient.request<any>(userPortfolioQuery, userPortfolioVariables);
    console.log('Moxie API Response:', JSON.stringify(portfolioData, null, 2));

    if (!portfolioData.users || portfolioData.users.length === 0) {
      console.warn('No user data found in Moxie API response');
      return c.res({
        image: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
            <h1 style={{ fontSize: '48px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>No fan tokens found for this user</h1>
          </div>
        ),
        intents: [
          <Button action="/">Back</Button>
        ]
      });
    }

    const ownedTokens = portfolioData.users[0]?.portfolio || [];

    return c.res({
      image: (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          width: '1200px', 
          height: '628px', 
          backgroundImage: 'url(https://bafybeie6dohh2woi4zav4xj24fmqo57ygf2f22yv42oaqjyl3zlpxlo4ie.ipfs.w3s.link/Untitled%20542.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          color: 'white',
          fontFamily: 'Arial, sans-serif',
          padding: '40px',
          boxSizing: 'border-box',
        }}>
          <div style={{
            width: '150px',
            height: '150px',
            borderRadius: '50%',
            overflow: 'hidden',
            backgroundColor: '#FFA500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            alignSelf: 'center',
          }}>
            <img 
              src={profileInfo?.farcasterSocial?.profileImage || '/api/placeholder/150/150'} 
              alt="Profile" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <h1 style={{ fontSize: '48px', color: '#FFD700', marginBottom: '20px', textAlign: 'center' }}>
            Your Owned Fan Tokens
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', flex: 1 }}>
            {ownedTokens.length > 0 ? (
              ownedTokens.map((token: any, index: number) => (
                <div key={index} style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  marginBottom: '20px', 
                  backgroundColor: 'rgba(255,255,255,0.8)',
                  padding: '10px',
                  borderRadius: '10px',
                  color: '#000000'
                }}>
                  <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {token.subjectToken.name} ({token.subjectToken.symbol})
                  </p>
                  <p style={{ fontSize: '20px' }}>
                    Balance: {parseFloat(token.balance) / 1e18} tokens
                  </p>
                  <p style={{ fontSize: '20px' }}>
                    Buy Volume: {parseFloat(token.buyVolume) / 1e18} tokens
                  </p>
                  <p style={{ fontSize: '20px' }}>
                    Sell Volume: {parseFloat(token.sellVolume) / 1e18} tokens
                  </p>
                </div>
              ))
            ) : (
              <p style={{ fontSize: '24px', color: '#FFFFFF', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: '20px', borderRadius: '10px' }}>No owned fan tokens found</p>
            )}
          </div>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>,
        <Button action="/yourfantoken">Your Fan Token</Button>,
      ]
    });
  } catch (error) {
    console.error('Error fetching data from Moxie API:', error);
    
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error('Error details:', error.stack);
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else {
      errorMessage = 'An unknown error occurred';
    }

    return c.res({
      image: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <h1 style={{ fontSize: '36px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Error fetching fan tokens: {errorMessage}</h1>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>
      ]
    });
  }
});

export const GET = handle(app);
export const POST = handle(app);