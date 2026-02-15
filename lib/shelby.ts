import {
    ShelbyClient,
} from "@shelby-protocol/sdk/browser";
import { AccountAddress } from "@aptos-labs/ts-sdk";

// Initialize client if API key is present
const API_KEY = process.env.NEXT_PUBLIC_SHELBY_API_KEY;

// Mock data store for demo purposes
const mockStorage: Record<string, Blob> = {};

// Helper to get client
const getClient = () => {
    if (!API_KEY) throw new Error("Shelby API Key not found");
    return new ShelbyClient({
        apiKey: API_KEY,
        network: "SHELBYNET" as any, // Cast to avoid enum issues for now
        rpc: {
            baseUrl: "https://api.shelbynet.shelby.xyz/shelby",
        },
    });
};

export const getFileFromShelby = async (cid: string): Promise<Blob | null> => {
    if (API_KEY) {
        try {
            const client = getClient();

            // Parse CID: address/blobName
            const parts = cid.split('/');
            if (parts.length < 2) throw new Error("Invalid CID format. Expected address/blobName");

            const account = parts[0];
            const blobName = parts.slice(1).join('/');

            const blob = await client.download({
                account: AccountAddress.fromString(account),
                blobName: blobName,
            });
            // Convert ReadableStream to Blob
            return new Response(blob.readable).blob();
        } catch (error) {
            console.error("Shelby SDK Download Error:", error);
            return null;
        }
    } else {
        console.warn("Shelby API Key not found. Using Mock Implementation.");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return mockStorage[cid] || null;
    }
};
