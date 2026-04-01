export interface BigModelConfig {
  apiKey: string;
  baseUrl: string;
}

export interface AppConfig {
  version: string;
  providers: {
    bigmodel: BigModelConfig;
  };
  updatedAt: string;
}

