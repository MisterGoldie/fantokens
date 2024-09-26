declare module "@duneanalytics/client-sdk" {
    export class DuneClient {
      constructor(apiKey: string);
      getLatestResult(params: { queryId: number }): Promise<any>;
    }
  }