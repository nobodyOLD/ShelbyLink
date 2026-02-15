"use client";

import { useState } from "react";
import { ShelbyClient } from "@shelby-protocol/sdk/browser";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Coins, Loader2 } from "lucide-react";

export const Faucet = () => {
    const { account } = useWallet();
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [status, setStatus] = useState<"success" | "error" | "">("");

    // Initialize Shelby Client
    const client = new ShelbyClient({
        apiKey: process.env.NEXT_PUBLIC_SHELBY_API_KEY,
        network: "SHELBYNET" as any,
        rpc: {
            baseUrl: "https://api.shelbynet.shelby.xyz/shelby",
        },
        indexer: {
            baseUrl: "https://api.shelbynet.shelby.xyz/v1/graphql",
        },
        faucet: {
            baseUrl: "https://faucet.shelbynet.shelby.xyz/fund",
            authToken: undefined,
        },
        aptos: {
            network: "SHELBYNET" as any,
            fullnode: "https://api.shelbynet.shelby.xyz",
            faucet: "https://faucet.shelbynet.shelby.xyz",
        }
    });

    const fundShelbyUSD = async () => {
        if (!account) return;
        try {
            setIsLoading(true);
            setMessage("Funding ShelbyUSD...");
            setStatus("");

            // Manual fetch to handle response better than SDK
            const response = await fetch("https://faucet.shelbynet.shelby.xyz/fund", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    address: account.address.toString(),
                    amount: 100_000 // Reduced amount to avoid limits
                })
            });

            const text = await response.text();
            if (!response.ok) {
                throw new Error(`Faucet failed (${response.status}): ${text}`);
            }

            if (!text) {
                throw new Error("Faucet returned empty response");
            }

            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                throw new Error(`Invalid JSON from faucet: ${text.slice(0, 100)}`);
            }

            if (json.txn_hashes && json.txn_hashes[0]) {
                setStatus("success");
                setMessage(`Funded ShelbyUSD! Tx: ${json.txn_hashes[0].slice(0, 8)}...`);
            } else {
                console.warn("Faucet response missing txn_hashes:", json);
                setStatus("success"); // Assume success if no error, but warn
                setMessage("Funded (Tx hash missing from response)");
            }

        } catch (error: any) {
            console.error("Faucet Error:", error);
            setStatus("error");
            setMessage("Failed to fund ShelbyUSD: " + (error.message || "Unknown error"));
        } finally {
            setIsLoading(false);
        }
    };

    const fundAPT = async () => {
        if (!account) return;
        try {
            setIsLoading(true);
            setMessage("Funding APT...");
            setStatus("");

            // Manual fetch for APT faucet (usually /mint) with query params
            const amount = 100_000; // 0.001 APT (reduced to avoid rate limits)
            const url = `https://faucet.shelbynet.shelby.xyz/mint?amount=${amount}&address=${account.address.toString()}`;

            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}) // Empty body required? 
            });

            const text = await response.text();

            if (response.status === 429 || text.includes("rejected by")) {
                setStatus("error");
                setMessage("Rate limit reached. Please wait a few minutes before trying again.");
                return;
            }

            if (!response.ok) {
                throw new Error(`Faucet failed (${response.status}): ${text}`);
            }

            if (!text) {
                // Some faucets return empty body on success
                setStatus("success");
                setMessage("Funded APT!");
                return;
            }

            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                // If text is not JSON but status is OK, assume success
                setStatus("success");
                setMessage("Funded APT! (Response: " + text.slice(0, 20) + "...)");
                return;
            }

            if (Array.isArray(json) && json.length > 0) {
                // Array of tx hashes?
                setStatus("success");
                setMessage(`Funded APT! Tx: ${json[0].slice(0, 8)}...`);
            } else if (typeof json === 'string') {
                setStatus("success");
                setMessage(`Funded APT! Tx: ${json.slice(0, 8)}...`);
            } else {
                console.warn("APT Faucet response format unknown:", json);
                setStatus("success");
                setMessage("Funded APT!");
            }

        } catch (error: any) {
            console.error("Faucet Error:", error);
            setStatus("error");
            setMessage("Failed to fund APT: " + (error.message || "Unknown error"));
        } finally {
            setIsLoading(false);
        }
    };

    if (!account) return null;

    return (
        <div className="bg-gray-50 border rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
                <Coins className="w-5 h-5 text-gray-700" />
                <h3 className="font-semibold text-gray-900">Devnet Faucet</h3>
            </div>

            <div className="flex flex-wrap gap-3">
                <button
                    onClick={fundShelbyUSD}
                    disabled={isLoading}
                    className="flex-1 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-100 disabled:opacity-50 text-sm font-medium transition-colors"
                >
                    {isLoading && message.includes("ShelbyUSD") ? (
                        <span className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Funding...
                        </span>
                    ) : (
                        "Get ShelbyUSD"
                    )}
                </button>
                <button
                    onClick={fundAPT}
                    disabled={isLoading}
                    className="flex-1 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-100 disabled:opacity-50 text-sm font-medium transition-colors"
                >
                    {isLoading && message.includes("APT") ? (
                        <span className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Funding...
                        </span>
                    ) : (
                        "Get APT"
                    )}
                </button>
            </div>

            {message && (
                <div className={`mt-3 text-sm ${status === "success" ? "text-green-600" : "text-red-600"}`}>
                    {message}
                </div>
            )}
        </div>
    );
};
