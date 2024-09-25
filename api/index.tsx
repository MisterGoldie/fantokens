import { Button, Frog } from 'frog';
import { handle } from 'frog/vercel';
import { neynar } from 'frog/middlewares';

const AIRSTACK_API_URL = 'https://api.airstack.xyz/gql';
const AIRSTACK_API_KEY = process.env.AIRSTACK_API_KEY || '';
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';
const DUNE_API_KEY = process.env.DUNE_API_KEY || '';

if (!AIRSTACK_API_KEY) {
  console.warn('AIRSTACK_API_KEY is not set in the environment variables');
}

if (!NEYNAR_API_KEY) {
  console.warn('NEYNAR_API_KEY is not set in the environment variables');
}

if (!DUNE_API_KEY) {
  console.warn('DUNE_API_KEY is not set in the environment variables');
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

interface OwnedToken {
  holderId: string;
  holderProfileName: string;
  holderProfileImageUrl: string;
  balance: string;
  tokenEntitySymbol: string;
  tokenMinPriceInMoxie: string;
}

async function getProfileInfo(fid: string): Promise<ProfileInfo | null> {
  const query = `
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
    const response = await fetch(AIRSTACK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': AIRSTACK_API_KEY,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Profile API response data:', JSON.stringify(data, null, 2));

    if (data.errors) {
      throw new Error('GraphQL errors in the response');
    }

    const wallet = data.data.Wallet;
    const social = data.data.farcasterSocials.Social[0];

    return {
      primaryDomain: wallet.primaryDomain,
      farcasterSocial: social,
    };
  } catch (error) {
    console.error('Error in getProfileInfo:', error);
    return null;
  }
}

async function getRewardsInfo(fid: string): Promise<any> {
  try {
    const meta = {
      "x-dune-api-key": DUNE_API_KEY
    };
    const header = new Headers(meta);
    const latest_response = await fetch(`https://api.dune.com/api/v1/query/3509966/results?&filters=query_fid=${fid}`, {
      method: 'GET',
      headers: header,
    });

    if (!latest_response.ok) {
      throw new Error(`HTTP error! status: ${latest_response.status}`);
    }

    const body = await latest_response.text();
    const recs = JSON.parse(body).result.rows[0]; // will only be one row in the result, for the filtered fid

    console.log('Dune query result:', JSON.stringify(recs, null, 2));
    
    return recs;
  } catch (error) {
    console.error('Error fetching rewards from Dune:', error);
    return null;
  }
}

async function getOwnedFanTokens(fid: string): Promise<OwnedToken[]> {
  const query = `
    query GetOwnedFanTokens($fid: Identity!) {
      Tokens(
        input: {filter: {owner: {_eq: $fid}, tokenType: {_in: [ERC20]}, tokenAddress: {_in: ["0x3006424b9e166978b5afa7e1e1887acd60d35f82"]}}, blockchain: ALL, limit: 50}
      ) {
        Token {
          tokenAddress
          tokenId
          tokenType
          token {
            name
            symbol
            decimals
          }
          amount
          formattedAmount
          owner {
            addresses
            domains {
              name
              avatar
            }
            socials {
              dappName
              profileName
              profileImage
            }
          }
        }
      }
    }
  `;

  const variables = { fid: `fc_fid:${fid}` };

  try {
    const response = await fetch(AIRSTACK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': AIRSTACK_API_KEY,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
    }

    const data = await response.json();
    console.log('Owned Fan Tokens API response data:', JSON.stringify(data, null, 2));

    if (data.errors) {
      throw new Error('GraphQL errors in the response: ' + JSON.stringify(data.errors));
    }

    const tokens = data.data.Tokens.Token || [];

    return tokens.map((token: any): OwnedToken => ({
      holderId: fid,
      holderProfileName: token.owner.socials?.[0]?.profileName || '',
      holderProfileImageUrl: token.owner.socials?.[0]?.profileImage || '',
      balance: token.formattedAmount || token.amount,
      tokenEntitySymbol: token.token.symbol,
      tokenMinPriceInMoxie: '0', // This information is not available in this query
    }));
  } catch (error) {
    console.error('Error in getOwnedFanTokens:', error);
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
        <h1 style={{ fontSize: '48px', color: 'white', textShadow: '2px 2px 4px rgba(0,0,0,0.5)', marginBottom: '20px' }}>
          Farcaster Fan Token Tracker
        </h1>
        <p style={{ fontSize: '24px', color: '#A9A9A9', textAlign: 'center' }}>
          Check your fan tokens and their details
        </p>
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '1200px', height: '628px', backgroundColor: '#1A1A1A' }}>
          <h1 style={{ fontSize: '48px', marginBottom: '20px', color: 'white', textAlign: 'center' }}>Error: No FID</h1>
        </div>
      ),
      intents: [
        <Button action="/">Back</Button>
      ]
    });
  }

  let tokenInfo = await getRewardsInfo(fid.toString());

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
        padding: '20px',
        boxSizing: 'border-box',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <h1 style={{ fontSize: '48px', color: '#FFD700', marginBottom: '20px', textAlign: 'center' }}>
          Your Fan Token
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', overflowY: 'auto', maxHeight: '500px' }}>
          {tokenInfo ? (
            <div style={{ textAlign: 'center', border: '1px solid #FFD700', padding: '20px', borderRadius: '10px' }}>
              <p style={{ fontSize: '24px', color: '#FFD700', marginBottom: '10px' }}>FID: {tokenInfo.query_fid}</p>
              <p style={{ fontSize: '18px', color: '#BDBDBD' }}>Last Price: {tokenInfo.last_price?.toFixed(6) || 'N/A'} MOXIE</p>
              <p style={{ fontSize: '18px', color: '#BDBDBD' }}>All Earnings: {tokenInfo.all_earnings?.toFixed(6) || 'N/A'} MOXIE</p>
              <p style={{ fontSize: '18px', color: '#BDBDBD' }}>Cast Earnings: {tokenInfo.cast_earnings?.toFixed(6) || 'N/A'} MOXIE</p>
              <p style={{ fontSize: '18px', color: '#BDBDBD' }}>Frame Earnings: {tokenInfo.frame_earnings?.toFixed(6) || 'N/A'} MOXIE</p>
              {/* Add more fields as needed */}
            </div>
          ) : (
            <p style={{ fontSize: '24px', color: '#BDBDBD', textAlign: 'center' }}>No fan token information available for this FID</p>
          )}
        </div>
      </div>
    ),
    intents: [
      <Button action="/">Back</Button>,
      <Button action="/yourfantoken">Refresh</Button>,
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
          {ownedTokens.length > 0 ? (
            ownedTokens.map((token: OwnedToken, index: number) => (
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
      <Button action="/">Back</Button>,
      <Button action="/check">Check Your Fan Token</Button>,
    ]
  });
});

export const GET = handle(app);
export const POST = handle(app);