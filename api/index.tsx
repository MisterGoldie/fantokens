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

// Type definitions
interface TokenHolding {
  balance: string;
  buyVolume: string;
  sellVolume: string;
  subjectToken: {
    id: any;
    name: string;
    symbol: string;
    currentPriceInMoxie: string;
  };
}

interface VestingContractResponse {
  tokenLockWallets: Array<{
    address: string;
  }>;
}

interface SubjectToken {
  currentPriceInMoxie: string;
  id: string;
  name: string;
  symbol: string;
  portfolio: TokenHolding[];
}

interface TokenInfo {
  subjectTokens: SubjectToken[];
}

interface ProfileInfo {
  farcasterSocial: {
    profileDisplayName: string;
    profileImage: string;
    profileBio: string;
    followerCount: number;
    followingCount: number;
    farcasterScore: {
      farScore: number;
    };
  };
  primaryDomain?: {
    name: string;
  };
}

interface VestingContractResponse {
  tokenLockWallets: Array<{
    address: string;
  }>;
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

async function getPowerboostScore(fid: string): Promise<number | null> {
  const AIRSTACK_API_URL = 'https://api.airstack.xyz/gql';
  const graphQLClient = new GraphQLClient(AIRSTACK_API_URL, {
    headers: {
      'Authorization': AIRSTACK_API_KEY,
    },
  });

  const query = gql`
    query MyQuery($userId: String!) {
      Socials(
        input: {
          filter: {
            dappName: {_eq: farcaster},
            userId: {_eq: $userId}
          },
          blockchain: ethereum
        }
      ) {
        Social {
          farcasterScore {
            powerBoost
          }
        }
      }
    }
  `;

  const variables = {
    userId: fid
  };

  try {
    const data = await graphQLClient.request<any>(query, variables);
    console.log('Airstack API response for powerboost:', JSON.stringify(data, null, 2));

    if (data.Socials.Social && data.Socials.Social[0]?.farcasterScore?.powerBoost) {
      return data.Socials.Social[0].farcasterScore.powerBoost;
    } else {
      console.log(`No powerboost score found for FID: ${fid}`);
      return null;
    }
  } catch (error) {
    console.error('Error fetching powerboost score from Airstack:', error);
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

async function getFanTokenInfo(fid: string): Promise<TokenInfo | null> {
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

    return {
      subjectTokens: data.subjectTokens
    };
  } catch (error) {
    console.error('Error fetching fan token info from Moxie API:', error);
    return null;
  }
}

async function getFarcasterAddressesFromFID(fid: string): Promise<string[]> {
  const AIRSTACK_API_URL = 'https://api.airstack.xyz/gql';
  const graphQLClient = new GraphQLClient(AIRSTACK_API_URL, {
    headers: {
      'Authorization': AIRSTACK_API_KEY,
    },
  });

  const query = gql`
    query MyQuery($identity: Identity!) {
      Socials(
        input: {
          filter: { dappName: { _eq: farcaster }, identity: { _eq: $identity } }
          blockchain: ethereum
        }
      ) {
        Social {
          userAddress
          userAssociatedAddresses
        }
      }
    }
  `;

  const variables = {
    identity: `fc_fid:${fid}`
  };

  try {
    const data = await graphQLClient.request<any>(query, variables);
    console.log('Airstack API response:', JSON.stringify(data, null, 2));

    if (!data.Socials || !data.Socials.Social || data.Socials.Social.length === 0) {
      throw new Error(`No Farcaster profile found for FID: ${fid}`);
    }

    const social = data.Socials.Social[0];
    const addresses = [social.userAddress, ...(social.userAssociatedAddresses || [])];
    return [...new Set(addresses)]; // Remove duplicates
  } catch (error) {
    console.error('Error fetching Farcaster addresses from Airstack:', error);
    throw error;
  }
}

async function getOwnedFanTokens(userAddress: string): Promise<TokenHolding[] | null> {
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
            currentPriceInMoxie
          }
        }
      }
    }
  `;

  const variables = {
    userAddresses: [userAddress.toLowerCase()]
  };

  try {
    const data = await graphQLClient.request<any>(query, variables);
    console.log('Moxie API response for owned tokens:', JSON.stringify(data, null, 2));

    if (!data.users || data.users.length === 0 || !data.users[0].portfolio) {
      console.log(`No fan tokens found for address: ${userAddress}`);
      return null;
    }

    return data.users[0].portfolio;
  } catch (error) {
    console.error('Error fetching owned fan tokens from Moxie API:', error);
    return null;
  }
}

async function getVestingContractAddresses(ethAddress: string): Promise<string[]> {
  const graphQLClient = new GraphQLClient(
    "https://api.studio.thegraph.com/query/23537/moxie_vesting_mainnet/version/latest"
  );

  const query = gql`
    query MyQuery($beneficiary: Bytes) {
      tokenLockWallets(where: {beneficiary: $beneficiary}) {
        address: id
      }
    }
  `;

  const variables = {
    beneficiary: ethAddress.toLowerCase()
  };

  try {
    const data = await graphQLClient.request<VestingContractResponse>(query, variables);
    console.log('Moxie API response for vesting contracts:', JSON.stringify(data, null, 2));
    return data.tokenLockWallets.map((wallet: { address: string }) => wallet.address);
  } catch (error) {
    console.error('Error fetching vesting contract addresses:', error);
    throw new Error(error as string);
  }
}

async function getTokenInfo(tokenAddress: string) {
  console.log('Entering getTokenInfo for address:', tokenAddress);
  
  if (!tokenAddress || tokenAddress === 'undefined') {
    console.error('Invalid token address provided:', tokenAddress);
    return null;
  }

  const graphQLClient = new GraphQLClient(MOXIE_API_URL);

  const query = gql`
    query GetTokenInfo($id: ID!) {
      subjectTokens(where: { id: $id }) {
        id
        name
        symbol
        currentPriceInMoxie
      }
    }
  `;

  const variables = {
    id: tokenAddress.toLowerCase()
  };

  try {
    console.log('Sending GraphQL request with variables:', JSON.stringify(variables));
    const data = await graphQLClient.request<any>(query, variables);
    console.log('GraphQL response received:', JSON.stringify(data, null, 2));

    if (data.subjectTokens && data.subjectTokens.length > 0) {
      const token = data.subjectTokens[0];
      console.log('Token data found:', JSON.stringify(token, null, 2));
      // Extract FID from symbol if it's in the format "fid:123"
      const fidMatch = token.symbol.match(/^fid:(\d+)$/);
      const result = {
        ...token,
        fid: fidMatch ? fidMatch[1] : null
      };
      console.log('Processed token info:', JSON.stringify(result, null, 2));
      return result;
    }
    console.log('No token data found');
    return null;
  } catch (error) {
    console.error('Error in getTokenInfo:', error);
    return null;
  }
}
// The code stops here, right before the (/) page starts

app.frame('/', (c) => {
  return c.res({
    image: (
      <div
        style={{
          width: '1200px',
          height: '628px',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: 'Arial, sans-serif',
          color: '#FFD700',
          padding: '20px',
        }}
      >
        <div
          style={{
            fontSize: '72px',
            fontWeight: 'bold',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '4px',
            textShadow: '0 0 10px rgba(255,215,0,0.7), 0 0 20px rgba(255,215,0,0.5), 0 0 30px rgba(255,215,0,0.3)',
            marginBottom: '20px',
          }}
        >
          You & Your
        </div>
        <div
          style={{
            fontSize: '96px',
            fontWeight: 'bold',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '6px',
            background: 'linear-gradient(45deg, #8B50FA, #9B6DF1)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
          }}
        >
          Fan Tokens
        </div>
      </div>
    ),
    intents: [
      <Button action="/yourfantoken">Your Fan Token</Button>,
    ],
  });
});

app.frame('/yourfantoken', async (c) => {
  console.log('Entering /yourfantoken frame');
  const { fid } = c.frameData ?? {};

  console.log(`FID: ${fid}`);

  if (!fid) {
    console.error('No FID found in frameData');
    return c.res({
      image: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#87CEEB' }}>
          <h1 style={{ fontSize: '64px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Error: No FID</h1>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>
      ]
    });
  }

  try {
    let tokenInfo = await getFanTokenInfo(fid.toString());
    let profileInfo = await getProfileInfo(fid.toString());
    let powerboostScore = await getPowerboostScore(fid.toString());

    function TextBox({ label, value }: TextBoxProps) {
      return (
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          padding: '15px',
          margin: '10px',
          borderRadius: '15px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '300px',
          height: '130px',
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{label}</div>
          <div style={{ fontSize: '32px' }}>{value}</div>
        </div>
      );
    }

    const currentPrice = tokenInfo?.subjectTokens[0] ? parseFloat(tokenInfo.subjectTokens[0].currentPriceInMoxie).toFixed(2) : 'N/A';
    const holders = tokenInfo?.subjectTokens[0] ? tokenInfo.subjectTokens[0].portfolio.length.toString() : 'N/A';
    const powerboost = powerboostScore !== null ? powerboostScore.toFixed(2) : 'N/A';

    const shareText = `Check out my /airstack Fan Token stats by @goldie! Check your own stats here`;
    
    const backgroundImage = 'https://bafybeidk74qchajtzcnpnjfjo6ku3yryxkn6usjh2jpsrut7lgom6g5n2m.ipfs.w3s.link/Untitled%20543%201.png';

    // Updated: Construct the share URL for the new /share endpoint
    const shareUrl = `https://fantokens-kappa.vercel.app/api/share?fid=${fid}`;
    const farcasterShareURL = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(shareUrl)}`;

    return c.res({
      image: (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1200px', 
          height: '628px', 
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          fontFamily: 'Arial, sans-serif',
          color: '#000000',
          padding: '20px',
          boxSizing: 'border-box',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            overflow: 'hidden',
            backgroundColor: '#FFA500',
            marginBottom: '20px',
            boxShadow: '0 0 20px rgba(255, 165, 0, 0.5)',
          }}>
            <img 
              src={profileInfo?.farcasterSocial?.profileImage || '/api/placeholder/150/150'} 
              alt="Profile" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          
          <h1 style={{ 
            fontSize: '48px', 
            fontWeight: 'bold', 
            textAlign: 'center', 
            margin: '10px 0 20px',
            color: '#ffffff',
            textShadow: '2px 2px 4px rgba(0,0,0,0.1)'
          }}>
            My Fan Token
          </h1>
          
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            maxWidth: '1000px',
          }}>
            <TextBox label="Current Price" value={`${currentPrice} MOXIE`} />
            <TextBox label="Powerboost" value={powerboost} />
            <TextBox label="Holders" value={holders} />
          </div>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>,
        <Button action="/yourfantoken">Refresh</Button>,
        <Button action="/owned-tokens">Owned</Button>,
        <Button.Link href={farcasterShareURL}>Share</Button.Link>,
      ],
    });
  } catch (error) {
    console.error('Error fetching fan token data:', error);
    
    return c.res({
      image: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <h1 style={{ fontSize: '36px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Error fetching fan token data. Please try again.</h1>
        </div>
      ),
      intents: [
        <Button action="/">Home</Button>
      ]
    });
  }
});

app.frame('/share', async (c) => {
  console.log('Entering /share frame');
  const fid = c.req.query('fid');

  console.log(`FID: ${fid}`);

  if (!fid) {
    return c.res({
      image: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <h1 style={{ fontSize: '48px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Error: No FID provided</h1>
        </div>
      ),
      intents: [
        <Button action="/">Home</Button>
      ]
    });
  }

  try {
    let tokenInfo = await getFanTokenInfo(fid.toString());
    let profileInfo = await getProfileInfo(fid.toString());
    let powerboostScore = await getPowerboostScore(fid.toString());

    function TextBox({ label, value }: TextBoxProps) {
      return (
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          padding: '15px',
          margin: '10px',
          borderRadius: '15px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '300px',
          height: '130px',
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{label}</div>
          <div style={{ fontSize: '32px' }}>{value}</div>
        </div>
      );
    }

    const currentPrice = tokenInfo?.subjectTokens[0] ? parseFloat(tokenInfo.subjectTokens[0].currentPriceInMoxie).toFixed(2) : 'N/A';
    const holders = tokenInfo?.subjectTokens[0] ? tokenInfo.subjectTokens[0].portfolio.length.toString() : 'N/A';
    const powerboost = powerboostScore !== null ? powerboostScore.toFixed(2) : 'N/A';
    
    const backgroundImage = 'https://bafybeidk74qchajtzcnpnjfjo6ku3yryxkn6usjh2jpsrut7lgom6g5n2m.ipfs.w3s.link/Untitled%20543%201.png';

    return c.res({
      image: (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1200px', 
          height: '628px', 
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          fontFamily: 'Arial, sans-serif',
          color: '#000000',
          padding: '20px',
          boxSizing: 'border-box',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            overflow: 'hidden',
            backgroundColor: '#FFA500',
            marginBottom: '20px',
            boxShadow: '0 0 20px rgba(255, 165, 0, 0.5)',
          }}>
            <img 
              src={profileInfo?.farcasterSocial?.profileImage || '/api/placeholder/150/150'} 
              alt="Profile" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          
          <h1 style={{ 
            fontSize: '48px', 
            fontWeight: 'bold', 
            textAlign: 'center', 
            margin: '10px 0 20px',
            color: '#ffffff',
            textShadow: '2px 2px 4px rgba(0,0,0,0.1)'
          }}>
            {profileInfo?.farcasterSocial?.profileDisplayName || 'Unknown'}'s Fan Token
          </h1>
          
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            maxWidth: '1000px',
          }}>
            <TextBox label="Current Price" value={`${currentPrice} MOXIE`} />
            <TextBox label="Powerboost" value={powerboost} />
            <TextBox label="Holders" value={holders} />
          </div>
        </div>
      ),
      intents: [
        <Button action="/yourfantoken">Check Your Fan Token</Button>
      ]
    });
  } catch (error) {
    console.error('Error fetching fan token data:', error);
    
    return c.res({
      image: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <h1 style={{ fontSize: '36px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Error fetching fan token data. Please try again.</h1>
        </div>
      ),
      intents: [
        <Button action="/">Home</Button>
      ]
    });
  }
});

app.frame('/owned-tokens', async (c) => {
  console.log('Entering /owned-tokens frame');
  const { fid } = c.frameData || {};
  const currentIndex = parseInt(c.buttonValue || '0');

  console.log(`FID: ${fid}, Current Index: ${currentIndex}`);

  if (!fid) {
    console.error('No FID found in frameData');
    return c.res({
      image: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <div style={{ fontSize: '48px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Error: No FID</div>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>
      ]
    });
  }

  try {
    const userAddresses = await getFarcasterAddressesFromFID(fid.toString());
    let allOwnedTokens: TokenHolding[] = [];
    let allVestingAddresses: string[] = [];

    for (const address of userAddresses) {
      try {
        const tokens = await getOwnedFanTokens(address);
        if (tokens) {
          allOwnedTokens = allOwnedTokens.concat(tokens);
        }
        
        const vestingAddresses = await getVestingContractAddresses(address);
        allVestingAddresses = allVestingAddresses.concat(vestingAddresses);
      } catch (error) {
        console.error(`Error fetching data for address ${address}:`, error);
      }
    }

    if (allOwnedTokens.length === 0) {
      console.warn(`No fan tokens found for FID ${fid}`);
      return c.res({
        image: (
          <div style={{ 
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            alignItems: 'center',
            width: '1200px', 
            height: '628px', 
            backgroundImage: 'url(https://bafybeihchbzogsv4setiimulvkeufmqjx6n2gxw6nxftl7hz4jjy3p46im.ipfs.w3s.link/Group%2061%20(3).png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            padding: '20px',
          }}>
            <div style={{ display: 'flex', fontSize: '36px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
              No fan tokens found
            </div>
          </div>
        ),
        intents: [
          <Button action="/">Back</Button>
        ]
      });
    }

    const token = allOwnedTokens[currentIndex];
    let tokenProfileInfo = null;
    let tokenFid = '';

    if (token.subjectToken.symbol.startsWith('fid:')) {
      tokenFid = token.subjectToken.symbol.split(':')[1];
      try {
        tokenProfileInfo = await getProfileInfo(tokenFid);
      } catch (error) {
        console.error(`Error fetching profile for FID ${tokenFid}:`, error);
      }
    }

    const formatBalance = (balance: string, decimals: number = 18): string => {
      const balanceWei = BigInt(balance);
      const denomination = BigInt(10 ** decimals);
      const balanceTokens = Number(balanceWei) / Number(denomination);
      return balanceTokens.toFixed(2);
    };

    const formatNumber = (value: number | string | null | undefined): string => {
      if (value === null || value === undefined) return 'N/A';
      const num = typeof value === 'string' ? parseFloat(value) : value;
      
      if (num >= 1e9) {
        return (num / 1e9).toFixed(2) + 'B';
      } else if (num >= 1e6) {
        return (num / 1e6).toFixed(2) + 'M';
      } else if (num >= 1e3) {
        return (num / 1e3).toFixed(2) + 'K';
      } else if (num > 0 && num < 0.01) {
        return num.toExponential(2);
      } else {
        return num.toFixed(2);
      }
    };

    const tokenBalance = formatBalance(token.balance);
    const tokenOwnerName = tokenProfileInfo?.farcasterSocial?.profileDisplayName || token.subjectToken.name;

    // Ensure tokenAddress is correctly set
    const tokenAddress = token.subjectToken.id;
    console.log('Token Address for share URL:', tokenAddress);

    const shareText = `I am the proud owner of ${tokenBalance} of ${tokenOwnerName}'s Fan Tokens powered by @moxie.eth 👏. Check which Fan Tokens you own 👀. Frame by @goldie`;
    const shareUrl = `https://fantokens-kappa.vercel.app/api/share-owned?fid=${fid}&tokenAddress=${tokenAddress}&balance=${token.balance}&buyVolume=${token.buyVolume}&currentPrice=${token.subjectToken.currentPriceInMoxie}`;
    const farcasterShareURL = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(shareUrl)}`;

    console.log('Constructed share URL:', shareUrl);

    function TextBox({ label, value }: TextBoxProps) {
      return (
        <div style={{ 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          padding: '10px',
          margin: '5px',
          borderRadius: '10px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '28px',
          width: '300px',
          height: '130px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}>
          <div style={{ display: 'flex', fontWeight: 'bold', color: '#000000' }}>{label}</div>
          <div style={{ display: 'flex', color: '#000000', fontSize: '32px' }}>{value}</div>
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
          backgroundImage: 'url(https://bafybeiata3diat4mmcnz54vbqfrs5hqrbankpp5ynvhbtglrxakj55hx6y.ipfs.w3s.link/Frame%2064%20(8).png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          color: 'white',
          fontFamily: 'Arial, sans-serif',
          padding: '40px',
          boxSizing: 'border-box',
          position: 'relative',
        }}>
          <div style={{
            display: 'flex',
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            fontSize: '24px',
            color: '#000000',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            padding: '10px',
            borderRadius: '10px',
            fontWeight: 'bold',
          }}>
            {currentIndex + 1} of {allOwnedTokens.length}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '130px',
            height: '130px',
            borderRadius: '50%',
            overflow: 'hidden',
            backgroundColor: '#FFA500',
            marginBottom: '20px',
            boxShadow: '0 0 20px 10px rgba(128, 0, 128, 0.5)',
          }}>
            {tokenProfileInfo && tokenProfileInfo.farcasterSocial && tokenProfileInfo.farcasterSocial.profileImage ? (
              <img 
                src={tokenProfileInfo.farcasterSocial.profileImage}
                alt="Token Profile" 
                style={{ width: '150px', height: '150px', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '150px', height: '150px', backgroundColor: '#9054FF' }}>
                <span style={{ fontSize: '24px', color: '#ffffff' }}>Channel</span>
              </div>
            )}
          </div>
          <div style={{
            display: 'flex',
            fontSize: '48px', 
            color: '#000000', 
            marginBottom: '20px',
            textAlign: 'center',
            textShadow: '0 0 10px rgba(128, 0, 128, 0.5)'
          }}>
            {tokenOwnerName}
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
          }}>
            <TextBox label="Balance" value={`${tokenBalance} tokens`} />
            <TextBox label="Buy Volume" value={`${formatBalance(token.buyVolume)} MOXIE`} />
            <TextBox label="Current Price" value={`${formatNumber(token.subjectToken.currentPriceInMoxie)} MOXIE`} />
          </div>
        </div>
      ),
      intents: [
        <Button action="/">Home</Button>,
        ...(currentIndex > 0 ? [<Button action="/owned-tokens" value={(currentIndex - 1).toString()}>Previous</Button>] : []),
        ...(currentIndex < allOwnedTokens.length - 1 ? [<Button action="/owned-tokens" value={(currentIndex + 1).toString()}>Next</Button>] : []),
        <Button.Link href={farcasterShareURL}>Share</Button.Link>,
      ]
    });
  } catch (error) {
    console.error('Error fetching fan token data:', error);
    
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
          <div style={{ fontSize: '36px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
            Error fetching fan tokens: {errorMessage}
          </div>
        </div>
      ),
      intents: [
        <Button action="/">Home</Button>
      ]
    });
  }
});


app.frame('/share-owned', async (c) => {
  console.log('Entering /share-owned frame');
  const fid = c.req.query('fid');
  const tokenAddress = c.req.query('tokenAddress');
  const balance = c.req.query('balance');
  const buyVolume = c.req.query('buyVolume');
  const currentPrice = c.req.query('currentPrice');

  console.log(`FID: ${fid}, Token Address: ${tokenAddress}`);

  if (!fid || !tokenAddress || !balance || !buyVolume || !currentPrice) {
    return c.res({
      image: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <h1 style={{ fontSize: '48px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Error: Missing required information</h1>
        </div>
      ),
      intents: [
        <Button action="/">Home</Button>
      ]
    });
  }

  try {
    let tokenProfileInfo = null;
    let tokenName = 'Unknown Token';

    // Fetch token info using the tokenAddress
    const tokenInfo = await getTokenInfo(tokenAddress);
    if (tokenInfo) {
      if (tokenInfo.fid) {
        try {
          tokenProfileInfo = await getProfileInfo(tokenInfo.fid);
          tokenName = tokenProfileInfo?.farcasterSocial?.profileDisplayName || tokenInfo.name;
        } catch (error) {
          console.error(`Error fetching profile for FID ${tokenInfo.fid}:`, error);
          tokenName = tokenInfo.name; // Fallback to token name if profile fetch fails
        }
      } else {
        tokenName = tokenInfo.name;
      }
    }

    const formatBalance = (balance: string, decimals: number = 18): string => {
      const balanceWei = BigInt(balance);
      const denomination = BigInt(10 ** decimals);
      const balanceTokens = Number(balanceWei) / Number(denomination);
      return balanceTokens.toFixed(2);
    };

    const formatNumber = (value: string): string => {
      const num = parseFloat(value);
      if (isNaN(num)) return 'N/A';
      
      if (num >= 1e9) {
        return (num / 1e9).toFixed(2) + 'B';
      } else if (num >= 1e6) {
        return (num / 1e6).toFixed(2) + 'M';
      } else if (num >= 1e3) {
        return (num / 1e3).toFixed(2) + 'K';
      } else if (num > 0 && num < 0.01) {
        return num.toExponential(2);
      } else {
        return num.toFixed(2);
      }
    };

    function TextBox({ label, value }: TextBoxProps) {
      return (
        <div style={{ 
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          padding: '10px',
          margin: '5px',
          borderRadius: '10px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '300px',
          height: '130px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}>
          <div style={{ fontWeight: 'bold', color: '#000000' }}>{label}</div>
          <div style={{ color: '#000000', fontSize: '32px' }}>{value}</div>
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
          backgroundImage: 'url(https://bafybeiata3diat4mmcnz54vbqfrs5hqrbankpp5ynvhbtglrxakj55hx6y.ipfs.w3s.link/Frame%2064%20(8).png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          color: 'white',
          fontFamily: 'Arial, sans-serif',
          padding: '40px',
          boxSizing: 'border-box',
        }}>
          <div style={{
            width: '130px',
            height: '130px',
            borderRadius: '50%',
            overflow: 'hidden',
            backgroundColor: '#FFA500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            boxShadow: '0 0 20px 10px rgba(128, 0, 128, 0.5)',
          }}>
            {tokenProfileInfo && tokenProfileInfo.farcasterSocial && tokenProfileInfo.farcasterSocial.profileImage ? (
              <img 
                src={tokenProfileInfo.farcasterSocial.profileImage}
                alt="Token Profile" 
                style={{ width: '150px', height: '150px', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '150px', height: '150px', backgroundColor: '#9054FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '24px', color: '#ffffff' }}>Channel</span>
              </div>
            )}
          </div>
          <h1 style={{ 
            fontSize: '48px', 
            color: '#000000', 
            marginBottom: '20px', 
            textAlign: 'center',
            textShadow: '0 0 10px rgba(128, 0, 128, 0.5)'
          }}>
            {tokenName}
          </h1>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
          }}>
            <TextBox label="Balance" value={`${formatBalance(balance)} tokens`} />
            <TextBox label="Buy Volume" value={`${formatBalance(buyVolume)} MOXIE`} />
            <TextBox label="Current Price" value={`${formatNumber(currentPrice)} MOXIE`} />
          </div>
        </div>
      ),
      intents: [
        <Button action="/owned-tokens">Check Your Owned Tokens</Button>
      ]
    });
  } catch (error) {
    console.error('Error fetching fan token data:', error);
    
    return c.res({
      image: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <h1 style={{ fontSize: '36px', color: '#ffffff', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Error fetching fan token data. Please try again.</h1>
        </div>
      ),
      intents: [
        <Button action="/">Home</Button>
      ]
    });
  }
});


export const GET = handle(app);
export const POST = handle(app);

