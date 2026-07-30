export type WebspeakConfig = {
    relayURL: URL;
    sessionId: string;
    rtcConfiguration: RTCConfiguration;
    retryAttempts: number
}