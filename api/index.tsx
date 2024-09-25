import { Button, Frog } from 'frog';
import { handle } from 'frog/vercel';
import { neynar } from 'frog/middlewares';

const AIRSTACK_API_URL = 'https://api.airstack.xyz/gql';
const AIRSTACK_API_KEY = process.env.AIRSTACK_API_KEY || '';
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';

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

interface RewardDistribution {
  channelFans: number;
  creator: number;
  creatorFans: number;
  network: number;
}

interface FanTokenInfo {
  entityId: string;
  entityName: string;
  entitySymbol: string;
  minPriceInMoxie: number; // Changed to number
  rewardDistributionPercentage: RewardDistribution;
}

interface UserProfile {
  profileName: string;
  profileImage: string;
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

async function getFanTokenInfo(fid: string): Promise<{ fanToken: FanTokenInfo | null, userProfile: UserProfile | null }> {
  console.log(`Fetching fan token info for FID: ${fid}`);

  const query = `
    query GetFanTokenAndUserProfile($fid: String!) {
      FarcasterFanTokenAuctions(
        input: {filter: {entityType: {_in: [USER, CHANNEL, NETWORK]}, entityId: {_eq: $fid}}, blockchain: ALL, limit: 1}
      ) {
        FarcasterFanTokenAuction {
          entityId
          entityName
          entitySymbol
          minPriceInMoxie
          rewardDistributionPercentage {
            channelFans
            creator
            creatorFans
            network
          }
        }
      }
      Socials(
        input: {filter: {dappName: {_eq: farcaster}, userId: {_eq: $fid}}, blockchain: ethereum}
      ) {
        Social {
          profileName
          profileImage
        }
      }
    }
  `;

  const variables = { fid: fid };

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
    console.log('API response data:', JSON.stringify(data, null, 2));

    if (data.errors) {
      throw new Error('GraphQL errors in the response');
    }

    const fanToken = data.data?.FarcasterFanTokenAuctions?.FarcasterFanTokenAuction[0] || null;
    const userProfile = data.data?.Socials?.Social[0] || null;

    return { fanToken, userProfile };
  } catch (error) {
    console.error('Error in getFanTokenInfo:', error);
    return { fanToken: null, userProfile: null };
  }
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

async function getOwnedFanTokens(fid: string): Promise<any[]> {
  const query = `
    query GetOwnedFanTokens($fid: String!) {
      FarcasterFanTokenBalances(
        input: {filter: {holderId: {_eq: $fid}}, blockchain: ALL, limit: 50}
      ) {
        FarcasterFanTokenBalance {
          balance
          holderId
          holderProfileName
          holderProfileImageUrl
          tokenEntityId
          tokenEntityName
          tokenEntitySymbol
          tokenMinPriceInMoxie
        }
      }
    }
  `;

  const variables = { fid: fid };

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

    return data.data.FarcasterFanTokenBalances.FarcasterFanTokenBalance || [];
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
        padding: '20px',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          {profileInfo?.farcasterSocial.profileImage && (
            <img 
              src={profileInfo.farcasterSocial.profileImage} 
              alt="Profile" 
              style={{ width: '100px', height: '100px', borderRadius: '50%', marginRight: '20px' }}
            />
          )}
          <div>
            <p style={{ fontSize: '36px', color: '#FFD700', marginBottom: '5px' }}>
              {profileInfo?.farcasterSocial.profileDisplayName}
            </p>
            <p style={{ fontSize: '24px', color: '#BDBDBD' }}>
              @{profileInfo?.farcasterSocial.profileHandle}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', flex: 1 }}>
          {profileInfo ? (
            <>
              <div style={{ width: '48%', backgroundColor: '#2A2A2A', padding: '15px', borderRadius: '10px', marginBottom: '15px' }}>
                <h3 style={{ fontSize: '24px', color: '#FFD700', marginBottom: '10px' }}>Bio</h3>
                <p style={{ fontSize: '20px', color: 'white' }}>{profileInfo.farcasterSocial.profileBio}</p>
              </div>
              <div style={{ width: '48%', backgroundColor: '#2A2A2A', padding: '15px', borderRadius: '10px', marginBottom: '15px' }}>
                <h3 style={{ fontSize: '24px', color: '#FFD700', marginBottom: '10px' }}>Stats</h3>
                <p style={{ fontSize: '20px', color: 'white', marginBottom: '5px' }}>Followers: {profileInfo.farcasterSocial.followerCount}</p>
                <p style={{ fontSize: '20px', color: 'white', marginBottom: '5px' }}>Following: {profileInfo.farcasterSocial.followingCount}</p>
                <p style={{ fontSize: '20px', color: 'white' }}>FarScore: {profileInfo.farcasterSocial.farcasterScore.farScore.toFixed(2)}</p>
              </div>
              {profileInfo.primaryDomain && (
                <div style={{ width: '100%', backgroundColor: '#2A2A2A', padding: '15px', borderRadius: '10px' }}>
                  <h3 style={{ fontSize: '24px', color: '#FFD700', marginBottom: '10px' }}>Primary Domain</h3>
                  <p style={{ fontSize: '20px', color: 'white' }}>{profileInfo.primaryDomain.name}</p>
                </div>
              )}
            </>
          ) : (
            <p style={{ fontSize: '24px', color: '#BDBDBD', textAlign: 'center', width: '100%' }}>No profile information found</p>
          )}
        </div>
      </div>
    ),
    intents: [
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

  let { fanToken, userProfile } = await getFanTokenInfo(fid.toString());

  // Format minPriceInMoxie
  const formattedPrice = fanToken ? Number(fanToken.minPriceInMoxie).toFixed(6) : '0';

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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          {userProfile?.profileImage && (
            <img 
              src={userProfile.profileImage} 
              alt="Profile" 
              style={{ width: '120px', height: '120px', borderRadius: '50%', marginBottom: '15px' }}
            />
          )}
          <p style={{ fontSize: '32px', color: '#FFD700', textAlign: 'center', marginBottom: '10px' }}>
            {userProfile?.profileName || `FID: ${fid}`}
          </p>
          <p style={{ fontSize: '24px', color: '#BDBDBD', textAlign: 'center', marginBottom: '20px' }}>
            Min Price: {formattedPrice} MOXIE
          </p>
          {fanToken ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              <p style={{ fontSize: '28px', color: '#BDBDBD', textAlign: 'center', marginBottom: '15px' }}>Reward Distribution:</p>
              <div style={{ display: 'flex', justifyContent: 'space-around', width: '100%' }}>
                <p style={{ fontSize: '24px', color: '#BDBDBD', textAlign: 'center' }}>Fans: {fanToken.rewardDistributionPercentage.creatorFans}%</p>
                <p style={{ fontSize: '24px', color: '#BDBDBD', textAlign: 'center' }}>Creator: {fanToken.rewardDistributionPercentage.creator}%</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-around', width: '100%', marginTop: '10px' }}>
                <p style={{ fontSize: '24px', color: '#BDBDBD', textAlign: 'center' }}>Channel: {fanToken.rewardDistributionPercentage.channelFans}%</p>
                <p style={{ fontSize: '24px', color: '#BDBDBD', textAlign: 'center' }}>Network: {fanToken.rewardDistributionPercentage.network}%</p>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: '24px', color: '#BDBDBD', textAlign: 'center' }}>No fan token found</p>
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
            ownedTokens.map((token, index) => (
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
                    {token.holderProfileName} (FID: {token.holderId})
                  </p>
                  <p style={{ fontSize: '20px', color: '#A9A9A9' }}>
                    Balance: {token.balance} {token.tokenEntitySymbol}
                  </p>
                  <p style={{ fontSize: '18px', color: '#A9A9A9' }}>
                    Price: {Number(token.tokenMinPriceInMoxie).toFixed(6)} MOXIE
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