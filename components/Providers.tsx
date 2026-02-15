"use client";

import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { PropsWithChildren, useState } from "react";
import { Network } from "@aptos-labs/ts-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const Providers = ({ children }: PropsWithChildren) => {
    const [queryClient] = useState(() => new QueryClient());

    return (
        <AptosWalletAdapterProvider
            autoConnect={true}
            dappConfig={{
                network: Network.DEVNET,
                aptosConnectDappId: undefined // Optional
            }}
            onError={(error) => {
                console.log("error", error);
            }}
        >
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </AptosWalletAdapterProvider>
    );
};
