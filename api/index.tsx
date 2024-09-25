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
  imageUrl: string | null;
  minPriceInMoxie: number;
  rewardDistributionPercentage: RewardDistribution;
}

async function getFanTokenInfo(fid: string): Promise<FanTokenInfo[]> {
  console.log(`Fetching fan token info for FID: ${fid}`);

  const query = `
    query TrackFanTokenData($fid: String!) {
      FarcasterFanTokenAuctions(
        input: {filter: {entityType: {_in: [USER, CHANNEL, NETWORK]}, entityId: {_eq: $fid}}, blockchain: ALL, limit: 50}
      ) {
        FarcasterFanTokenAuction {
          auctionId
          decimals
          entityId
          entityName
          entitySymbol
          minPriceInMoxie
          channel {
            imageUrl
          }
          rewardDistributionPercentage {
            channelFans
            creator
            creatorFans
            network
          }
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

    return data.data?.FarcasterFanTokenAuctions?.FarcasterFanTokenAuction.map((token: any) => ({
      ...token,
      imageUrl: token.channel?.imageUrl || null,
    })) || [];
  } catch (error) {
    console.error('Error in getFanTokenInfo:', error);
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
      <Button action="/check">Check Fan Tokens</Button>,
    ],
  });
});

app.frame('/check', async (c) => {
  console.log('Entering /check frame');
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

  let fanTokens: FanTokenInfo[] = [];

  try {
    fanTokens = await getFanTokenInfo(fid.toString());
    console.log('Fan tokens retrieved:', JSON.stringify(fanTokens, null, 2));
  } catch (error) {
    console.error('Error in getFanTokenInfo:', error);
  }

  const token = fanTokens[0];

  return c.res({
    image: (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'row', 
        width: '1200px', 
        height: '628px', 
        backgroundColor: '#1A1A1A',
        color: 'white',
        fontFamily: 'Arial, sans-serif',
        padding: '40px',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: '30%', alignItems: 'center', justifyContent: 'center' }}>
          {token?.imageUrl && (
            <img 
              src={token.imageUrl} 
              alt="Profile" 
              style={{ width: '200px', height: '200px', borderRadius: '50%', marginBottom: '20px' }}
            />
          )}
          <h2 style={{ fontSize: '32px', color: '#FFD700', textAlign: 'center' }}>
            FID: {fid}
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', width: '70%', justifyContent: 'center' }}>
          <h1 style={{ fontSize: '48px', color: '#FFD700', marginBottom: '20px' }}>
            Fan Token for FID: {fid}
          </h1>
          {token ? (
            <div style={{ fontSize: '24px', color: '#BDBDBD' }}>
              <p>{token.entityName} ({token.entitySymbol})</p>
              <p>Min Price: {token.minPriceInMoxie} MOXIE</p>
              <p>Reward Distribution:</p>
              <p>Fans: {token.rewardDistributionPercentage.creatorFans}% | Creator: {token.rewardDistributionPercentage.creator}%</p>
              <p>Channel: {token.rewardDistributionPercentage.channelFans}% | Network: {token.rewardDistributionPercentage.network}%</p>
            </div>
          ) : (
            <p style={{ fontSize: '24px', color: '#BDBDBD' }}>No fan token found</p>
          )}
        </div>
      </div>
    ),
    intents: [
      <Button action="/">Back</Button>,
      <Button action="/check">Refresh</Button>,
    ]
  });
});

export const GET = handle(app);
export const POST = handle(app);