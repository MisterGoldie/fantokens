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
  imageOptions: { width: 1000, height: 1000 },
  imageAspectRatio: '1:1',
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
  channelFans: string;
  creator: string;
  creatorFans: string;
  network: string;
}

interface FanTokenInfo {
  auctionId: string;
  auctionSupply: string;
  decimals: number;
  entityId: string;
  entityName: string;
  entitySymbol: string;
  estimatedEndTimestamp: string;
  estimatedStartTimestamp: string;
  minBiddingAmount: string;
  minPriceInMoxie: string;
  subjectAddress: string;
  status: string;
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
          auctionSupply
          decimals
          entityId
          entityName
          entitySymbol
          estimatedEndTimestamp
          estimatedStartTimestamp
          minBiddingAmount
          minPriceInMoxie
          subjectAddress
          status
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
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (AIRSTACK_API_KEY) {
      headers['Authorization'] = AIRSTACK_API_KEY;
    } else {
      console.warn('AIRSTACK_API_KEY is not set, API request may fail');
    }

    const response = await fetch(AIRSTACK_API_URL, {
      method: 'POST',
      headers: headers,
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

    return data.data?.FarcasterFanTokenAuctions?.FarcasterFanTokenAuction || [];
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
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        backgroundColor: '#1DA1F2',
      }}>
        <h1 style={{ fontSize: '48px', color: 'white', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
          Farcaster Fan Token Tracker
        </h1>
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', backgroundColor: '#1DA1F2' }}>
          <h1 style={{ fontSize: '36px', marginBottom: '20px', color: 'white' }}>Error: No FID</h1>
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

  return c.res({
    image: (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'flex-start', 
        width: '100%', 
        height: '100%', 
        backgroundColor: '#1DA1F2',
        color: 'white',
        fontFamily: 'Arial, sans-serif',
        padding: '20px',
        boxSizing: 'border-box',
      }}>
        <h2 style={{ fontSize: '32px', marginBottom: '20px', color: 'white', textShadow: '1px 1px 2px rgba(0,0,0,0.5)', textAlign: 'center' }}>
          Fan Tokens for FID: {fid}
        </h2>
        {fanTokens.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '20px' }}>
            {fanTokens.map((token, index) => (
              <div key={index} style={{ 
                display: 'flex',
                flexDirection: 'column',
                padding: '15px', 
                backgroundColor: 'rgba(255,255,255,0.1)', 
                borderRadius: '10px',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{token.entityName}</span>
                  <span style={{ fontSize: '20px' }}>({token.entitySymbol})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Min Price:</span>
                  <span>{token.minPriceInMoxie} MOXIE</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Start:</span>
                  <span>{new Date(token.estimatedStartTimestamp).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>End:</span>
                  <span>{new Date(token.estimatedEndTimestamp).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '5px' }}>
                  <span style={{ flex: '1 0 40%' }}>Channel: {token.rewardDistributionPercentage.channelFans}%</span>
                  <span style={{ flex: '1 0 40%' }}>Creator: {token.rewardDistributionPercentage.creator}%</span>
                  <span style={{ flex: '1 0 40%' }}>Fans: {token.rewardDistributionPercentage.creatorFans}%</span>
                  <span style={{ flex: '1 0 40%' }}>Network: {token.rewardDistributionPercentage.network}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '24px' }}>No fan tokens found</p>
        )}
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