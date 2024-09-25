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
  imageOptions: { width: 1000, height: 1000 }, // Changed to 1:1 aspect ratio
  title: 'Farcaster Fan Token Tracker',
  hub: AIRSTACK_API_KEY ? {
    apiUrl: "https://hubs.airstack.xyz",
    fetchOptions: {
      headers: {
        "x-airstack-hubs": AIRSTACK_API_KEY,
      }
    }
  } : undefined
}).use(
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

const backgroundImageUrl = 'https://bafybeie3sl2oiahjedpkqxh5k6r2lse5bf77nwcirvtifzs43kcufesdnu.ipfs.w3s.link/Frame%2064.png';

app.frame('/', (c) => {
  return c.res({
    image: (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        backgroundImage: `url(${backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
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
  const { displayName, pfpUrl } = c.var.interactor || {};

  console.log(`FID: ${fid}, Display Name: ${displayName}, PFP URL: ${pfpUrl}`);

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
  let errorMessage = '';

  try {
    fanTokens = await getFanTokenInfo(fid.toString());
    console.log('Fan tokens retrieved:', JSON.stringify(fanTokens, null, 2));
  } catch (error) {
    console.error('Error in getFanTokenInfo:', error);
    errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
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
        backgroundImage: `url(${backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        padding: '20px', 
        boxSizing: 'border-box',
        fontFamily: 'Arial, sans-serif',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '20px',
          width: '100%',
        }}>
          {pfpUrl ? (
            <img 
              src={pfpUrl} 
              alt="Profile" 
              style={{ 
                width: '60px', 
                height: '60px', 
                borderRadius: '50%',
                border: '2px solid white',
                marginRight: '10px',
              }}
            />
          ) : (
            <div style={{ 
              width: '60px', 
              height: '60px', 
              borderRadius: '50%', 
              backgroundColor: '#ccc', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              border: '2px solid white',
              fontSize: '24px',
              color: '#333',
              marginRight: '10px',
            }}>
              {displayName ? displayName.charAt(0).toUpperCase() : 'U'}
            </div>
          )}
          <div>
            <p style={{ 
              fontSize: '24px', 
              color: 'white', 
              textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
              margin: '0',
            }}>
              FID: {fid}
            </p>
            <p style={{ 
              fontSize: '18px', 
              color: 'white', 
              textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
              margin: '0',
            }}>
              {displayName}
            </p>
          </div>
        </div>
        
        {errorMessage ? (
          <p style={{ fontSize: '24px', color: 'red', textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>Error: {errorMessage}</p>
        ) : fanTokens.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: '100%' }}>
            <h2 style={{ fontSize: '28px', marginBottom: '10px', color: 'white', textShadow: '1px 1px 2px rgba(0,0,0,0.5)', textAlign: 'center' }}>
              Your Fan Tokens
            </h2>
            {fanTokens.map((token, index) => (
              <div key={index} style={{ 
                fontSize: '16px', 
                marginBottom: '10px', 
                color: 'white', 
                textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                backgroundColor: 'rgba(0,0,0,0.5)',
                padding: '10px',
                borderRadius: '10px',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>{token.entityName} ({token.entitySymbol})</span>
                  <span>Supply: {(Number(token.auctionSupply) / 10**token.decimals).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>Min Price: {token.minPriceInMoxie} MOXIE</span>
                  <span>Status: {token.status}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>Start: {new Date(token.estimatedStartTimestamp).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>End: {new Date(token.estimatedEndTimestamp).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <span>Channel: {token.rewardDistributionPercentage.channelFans}%</span>
                  <span>Creator: {token.rewardDistributionPercentage.creator}%</span>
                  <span>Fans: {token.rewardDistributionPercentage.creatorFans}%</span>
                  <span>Network: {token.rewardDistributionPercentage.network}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '24px', color: 'white', textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>No fan tokens found</p>
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