import { ShelbyClient } from "@shelby-protocol/sdk/browser";

// Initialize client if API key is present
const API_KEY = process.env.NEXT_PUBLIC_SHELBY_API_KEY;

// Mock data store for demo purposes (in-memory, resets on reload)
// In a real app, this would be IPFS or permanent storage
const mockStorage: Record<string, Blob> = {};

export const uploadFileToShelby = async (file: File): Promise<string> => {
    if (API_KEY) {
        try {
            const client = new ShelbyClient({ apiKey: API_KEY });
            const cid = await client.upload(file);
            return cid;
        } catch (error) {
            console.error("Shelby SDK Upload Error:", error);
            throw new Error("Failed to upload to Shelby Protocol");
        }
    } else {
        console.warn("Shelby API Key not found. Using Mock Implementation.");
        // Simulate upload delay
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const cid = "QmMock" + Math.random().toString(36).substring(7);
        mockStorage[cid] = file;
        return cid;
    }
};

export const getFileFromShelby = async (cid: string): Promise<Blob | null> => {
    if (API_KEY) {
        try {
            const client = new ShelbyClient({ apiKey: API_KEY });
            // Assuming SDK has a download/get method returning Blob or similar
            const file = await client.download(cid);
            return file;
        } catch (error) {
            console.error("Shelby SDK Download Error:", error);
            return null;
        }
    } else {
        console.warn("Shelby API Key not found. Using Mock Implementation.");
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return mockStorage[cid] || null;
    }
};
