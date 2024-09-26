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

interface FanTokenAddressResponse {
  subjectTokens: Array<{
    address: string;
    name: string;
    symbol: string;
    decimals: number;
  }>;
}

interface FanTokenInfoResponse {
  subjectTokens: Array<{
    currentPriceInMoxie: string;
    id: string;
    name: string;
    symbol: string;
    portfolio: Array<{
      balance: string;
      user: {
        id: string;
      };
    }>;
  }>;
}

interface OwnedFanTokensResponse {
  users: Array<{
    portfolio: Array<{
      balance: string;
      buyVolume: string;
      sellVolume: string;
      subjectToken: {
        name: string;
        symbol: string;
      };
    }>;
  }>;
}

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
    const data = await graphQLClient.request<FanTokenAddressResponse>(query, variables);
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
    const data = await graphQLClient.request<FanTokenInfoResponse>(query, variables);
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

async function getOwnedFanTokens(userAddress: string): Promise<any[]> {
  const graphQLClient = new GraphQLClient(MOXIE_API_URL);

  const query = gql`
    query MyQuery($userAddresses: [ID!]) {
      users(where: { id_in: $userAddresses }) {
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

  const variables = {
    userAddresses: [userAddress]
  };

  try {
    const data = await graphQLClient.request<OwnedFanTokensResponse>(query, variables);
    console.log('Owned fan tokens query response:', JSON.stringify(data, null, 2));

    if (!data.users || data.users.length === 0 || !data.users[0].portfolio) {
      console.log(`No fan tokens found for user address: ${userAddress}`);
      return [];
    }

    return data.users[0].portfolio.map(token => ({
      name: token.subjectToken.name,
      symbol: token.subjectToken.symbol,
      balance: parseFloat(token.balance),
      buyVolume: parseFloat(token.buyVolume),
      sellVolume: parseFloat(token.sellVolume)
    }));
  } catch (error) {
    console.error('Error fetching owned fan tokens from Moxie API:', error);
    return [];
  }
}

app.frame('/', (c) => {
  return c.res({
    image: (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        width: '1200px',
        height: '628px',
        backgroundColor: '#1A1A1A',
        color: 'white',
        fontFamily: 'Arial, sans-serif',
      }}>
        <h1 style={{ fontSize: '48px', color: '#FFD700', textShadow: '2px 2px 4px rgba(0,0,0,0.5)', marginBottom: '20px' }}>
          Farcaster Fan Token Tracker
        </h1>
        <p style={{ fontSize: '24px', color: '#A9A9A9', textAlign: 'center', maxWidth: '80%', marginBottom: '40px' }}>
          Track your fan tokens, view your profile, and explore the Farcaster ecosystem
        </p>
        <div style={{
          backgroundColor: '#FFD700',
          padding: '10px 20px',
          borderRadius: '20px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}>
          <p style={{ fontSize: '20px', color: '#1A1A1A', fontWeight: 'bold' }}>
            Get Started
          </p>
        </div>
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#273444' }}>
          <h1 style={{ fontSize: '48px', marginBottom: '20px', color: '#ff49db', textAlign: 'center', fontFamily: 'Montserrat, sans-serif' }}>Error: No FID</h1>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>
      ]
    });
  }

  let tokenInfo = await getFanTokenInfo(fid.toString());

  return c.res({
    image: (
      <div style={{ display: 'flex', flexDirection: 'column', width: '1200px', height: '628px', backgroundColor: '#273444', color: '#d3dce6', fontFamily: 'Montserrat, sans-serif', padding: '20px', boxSizing: 'border-box', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ fontSize: '56px', color: '#FF6600', marginBottom: '20px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.1rem' }}>
          Your Fan Token
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', overflowY: 'auto', maxHeight: '500px' }}>
          {tokenInfo ? (
            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'center', border: '2px solid #ff7849', padding: '30px', borderRadius: '32px' }}>
              <p style={{ fontSize: '32px', color: '#FF6600', marginBottom: '15px', textAlign: 'center' }}>FID: {fid}</p>
              <p style={{ fontSize: '24px', color: '#d3dce6', textAlign: 'center' }}>Name: {tokenInfo.name}</p>
              <p style={{ fontSize: '24px', color: '#d3dce6', textAlign: 'center' }}>Symbol: {tokenInfo.symbol}</p>
              <p style={{ fontSize: '24px', color: '#d3dce6', textAlign: 'center' }}>Current Price: {tokenInfo.currentPriceInMoxie.toFixed(4)} MOXIE</p>
              <p style={{ fontSize: '24px', color: '#d3dce6', textAlign: 'center' }}>Number of Holders: {tokenInfo.holdersCount}</p>
            </div>
          ) : (
            <p style={{ fontSize: '28px', color: '#d3dce6', textAlign: 'center' }}>No fan token information available for this FID</p>
          )}
        </div>
      </div>
    ),
    intents: [
      <Button action="/">Back</Button>,
      <Button action="/yourfantoken">Refresh</Button>,
      <Button action="/owned-tokens">OFT</Button>,
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <h1 style={{ fontSize: '48px', marginBottom: '20px', color: 'white', textAlign: 'center' }}>Error: No FID</h1>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>
      ]
    });
  }

  // Note: You'll need to implement getOwnedFanTokens function
  const ownedTokens = await getOwnedFanTokens(fid.toString());

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
      }}>
        <h1 style={{ fontSize: '48px', color: '#FFD700', marginBottom: '20px', textAlign: 'center' }}>
          Your Owned Fan Tokens
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', flex: 1 }}>
          {ownedTokens && ownedTokens.length > 0 ? (
            ownedTokens.map((token: any, index: number) => (
              <div key={index} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                marginBottom: '20px', 
                backgroundColor: 'rgba(255,255,255,0.1)',
                padding: '10px',
                borderRadius: '10px'
              }}>
                <img 
                  src={token.holderProfileImageUrl || 'default-image-url'} 
                  alt="Profile" 
                  style={{ width: '50px', height: '50px', borderRadius: '50%', marginRight: '20px' }}
                />
                <div>
                  <p style={{ fontSize: '24px', color: '#BDBDBD' }}>
                    {token.holderProfileName || `FID: ${token.holderId}`}
                  </p>
                  <p style={{ fontSize: '20px', color: '#A9A9A9' }}>
                    Balance: {token.balance} {token.tokenEntitySymbol}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p style={{ fontSize: '24px', color: '#BDBDBD', textAlign: 'center' }}>No owned fan tokens found</p>
          )}
        </div>
      </div>
    ),
    intents: [
      <Button action="/">back</Button>,
      <Button action="/yourfantoken">Your Fan Token</Button>,
    ]
  });
});

export const GET = handle(app);
export const POST = handle(app);