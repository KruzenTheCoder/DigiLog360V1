// Ambient declaration so the offline-queue typechecks before
// `npm install` has pulled in @react-native-community/netinfo.
// Once installed for real, this file is ignored — the package's own
// types take precedence.
declare module '@react-native-community/netinfo' {
  export interface NetInfoState {
    isConnected: boolean | null;
    isInternetReachable: boolean | null;
  }
  const NetInfo: {
    fetch(): Promise<NetInfoState>;
    addEventListener(handler: (state: NetInfoState) => void): () => void;
  };
  export default NetInfo;
}
