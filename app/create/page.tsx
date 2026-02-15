"use client";

import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Upload, Link as LinkIcon, AlertCircle } from "lucide-react";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

// Initialize Aptos client
import { ShelbyClient, ShelbyBlobClient, generateCommitments, ClayErasureCodingProvider } from "@shelby-protocol/sdk/browser";
import { Faucet } from "../../components/Faucet";
// Configure Aptos client for Shelby Network (Custom)
const aptosConfig = new AptosConfig({
    network: Network.CUSTOM,
    fullnode: "https://api.shelbynet.shelby.xyz",
    faucet: "https://faucet.shelbynet.shelby.xyz"
});
const aptos = new Aptos(aptosConfig);

// Contract address - Replace with actual address after deployment
// For now using the placeholder 0xc0ffee
const MODULE_ADDRESS = "0x124992510e07b1bc4a9ad7bfc7bb87381d2e473c1b30c01d11c96640f8582cb9";
const MODULE_NAME = "shelby_link_v2";

export default function CreateLinkPage() {
    const { account, signAndSubmitTransaction, network: walletNetwork } = useWallet();
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState("0");
    const [isUploading, setIsUploading] = useState(false);
    const [txHash, setTxHash] = useState("");

    // Network check
    const isShelbyNetwork = walletNetwork?.url?.includes("shelbynet") || walletNetwork?.chainId?.toString() === "2026"; // Assuming 2026 or checking URL. Safest is URL.
    // Actually, checking URL is robust for custom networks.

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    // Initialize Shelby Client
    const client = new ShelbyClient({
        apiKey: undefined, // Public devnet nodes reject auth headers
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!account) return alert("Please connect wallet");
        if (!file) return alert("Please select a file");

        try {
            setIsUploading(true);
            (window as any).lastStep = "Starting";

            // Helper for custom polling to bypass SDK .json() crash and get better logs
            const pollTransaction = async (hash: string) => {
                const startTime = Date.now();
                const timeout = 60000; // Increase to 60s for safety
                console.log(`POLL START [${hash}]`);
                while (Date.now() - startTime < timeout) {
                    try {
                        const res = await fetch(`https://api.shelbynet.shelby.xyz/v1/transactions/by_hash/${hash}`);
                        const text = await res.text();
                        console.log(`POLL DEBUG [${hash.slice(0, 10)}]: status ${res.status}, body length: ${text.length}`);
                        if (res.ok && text) {
                            const json = JSON.parse(text);
                            // If it's a valid transaction (not pending or not found)
                            if (json.type !== "pending_transaction") {
                                console.log(`POLL SUCCESS [${hash.slice(0, 10)}]`);
                                return json;
                            }
                        }
                    } catch (e) {
                        console.warn("Poll attempt failed:", e);
                    }
                    await new Promise(r => setTimeout(r, 2000)); // Poll every 2s
                }
                throw new Error("Transaction timeout or polling error after 60s");
            };

            const blobName = `${Date.now()}-${file.name}`; // Ensure uniqueness

            // 1. Upload to Shelby using Manual Flow (bypassing Indexer check)
            console.log("STEP: Starting upload (manual payload flow)...");
            (window as any).lastStep = "ArrayBuffer";
            const blobData = new Uint8Array(await file.arrayBuffer());

            // A. Generate Commitments
            console.log("STEP: Generating commitments...");
            (window as any).lastStep = "ECProvider";
            const provider = await ClayErasureCodingProvider.create();
            (window as any).lastStep = "Commitments";
            const blobCommitments = await generateCommitments(provider, blobData);

            // B. Register Blob on-chain (Manual Transaction Construction)
            console.log("STEP: Registering blob on-chain...");
            (window as any).lastStep = "Payload";

            // Use static helper to create payload
            const registerPayload = ShelbyBlobClient.createRegisterBlobPayload({
                deployer: undefined,
                account: undefined as any, // Not used for payload construction logic
                useSponsoredUsdVariant: false,
                blobName: blobName,
                blobSize: blobData.length,
                blobMerkleRoot: blobCommitments.blob_merkle_root,
                expirationMicros: Date.now() * 1000 + 3600_000_000, // 1 hour
                numChunksets: blobCommitments.chunkset_commitments.length,
            });

            (window as any).lastStep = "SignReg";
            const registrationResponse = await signAndSubmitTransaction({
                sender: account.address,
                data: registerPayload as any // Cast to satisfy Wallet Adapter types
            });

            console.log("STEP: Registration tx waiting:", registrationResponse.hash);
            (window as any).lastStep = "WaitReg";
            try {
                // Use the same pollTransaction defined below or just inline it for now? 
                // Better to define it once. I will move the definition up.
                await pollTransaction(registrationResponse.hash);
                console.log("STEP: Registration tx confirmed");
            } catch (err: any) {
                console.error("STEP FAILURE: pollTransaction (Registration)", err);
                throw new Error("WaitReg failed: " + (err.message || String(err)));
            }

            // C. Upload to Storage RPC
            console.log("STEP: Putting blob to storage RPC...");
            (window as any).lastStep = "PutBlob";
            try {
                await client.rpc.putBlob({
                    account: account.address,
                    blobName: blobName,
                    blobData: blobData,
                });
                console.log("STEP: putBlob success");
            } catch (err: any) {
                console.error("STEP FAILURE: putBlob", err);
                throw new Error("putBlob failed: " + (err.message || String(err)));
            }

            // CID format: address/blobName
            const storageCid = `${account.address}/${blobName}`;
            console.log("Uploaded to Shelby, CID:", storageCid);

            // 2. Create Link Contract Call
            const priceInOctas = Math.floor(parseFloat(price) * 100_000_000).toString();
            console.log("STEP: Creating link with price (octas):", priceInOctas);
            (window as any).lastStep = "SignLink";

            const response = await signAndSubmitTransaction({
                sender: account.address,
                data: {
                    function: `${MODULE_ADDRESS}::${MODULE_NAME}::create_link`,
                    functionArguments: [title, description, storageCid, priceInOctas],
                },
            });

            console.log("STEP: Create Link tx submitted:", response.hash);
            (window as any).lastStep = "WaitLink";

            let committedTxn;
            try {
                committedTxn = await pollTransaction(response.hash);
                console.log("STEP: Create Link tx confirmed");
            } catch (err: any) {
                console.error("STEP FAILURE: pollTransaction (Create Link)", err);
                throw new Error("Polling for link creation failed: " + (err.message || String(err)));
            }
            (window as any).lastStep = "Done";

            // Attempt to find the created object address from changes
            let createdObjectAddress = "";
            if (committedTxn && "changes" in committedTxn) {
                const changes = committedTxn.changes;
                for (const change of (changes as any[])) {
                    if (change.type === "write_resource" && change.data) {
                        const data = change.data as { type: string };
                        if (data.type === "0x1::object::ObjectGroup") {
                            if (change.address) {
                                createdObjectAddress = change.address;
                                break;
                            }
                        }
                    }
                }
            }

            if (!createdObjectAddress) {
                createdObjectAddress = response.hash; // Fallback
            }

            setTxHash(createdObjectAddress);

        } catch (error: any) {
            console.error("Error creating link:", error);
            const msg = error?.message || String(error);
            const lastStep = (window as any).lastStep || "unknown";
            if (msg.includes("rejected")) {
                alert("Transaction rejected. Please approve the transaction in your wallet.");
            } else {
                alert(`Failed to create link at step [${lastStep}]: ` + msg + "\n\nTip: Ensure your wallet is funded and file name is unique.");
            }
        } finally {
            setIsUploading(false);
        }
    };

    if (txHash) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                <div className="bg-green-50 p-4 rounded-full">
                    <LinkIcon className="w-12 h-12 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold">Link Created Successfully!</h2>
                <p className="text-gray-600 max-w-md">Your paid link is ready. Share it with your community.</p>

                <div className="bg-gray-100 p-4 rounded-lg break-all font-mono text-sm max-w-lg">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/l/{txHash}
                </div>

                <a
                    href={`/l/${txHash}`}
                    className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                    View Link
                </a>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto py-12">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">Create Paid Link</h1>
                <p className="text-gray-500">Upload content and set a price for access.</p>
            </div>

            {!account ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 flex items-center gap-4 text-amber-800">
                    <AlertCircle />
                    <span>Please connect your wallet to create a link.</span>
                </div>
            ) : !isShelbyNetwork && walletNetwork ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex flex-col gap-2 text-red-800">
                    <div className="flex items-center gap-4">
                        <AlertCircle />
                        <span className="font-bold">Wrong Network Detected</span>
                    </div>
                    <p className="text-sm ml-10">
                        You are connected to <strong>{walletNetwork.name || "Unknown Network"}</strong> ({walletNetwork.url}).
                        <br />
                        Please switch your wallet to <strong>Shelby Devnet</strong>.
                        <br />
                        RPC: <code>https://api.shelbynet.shelby.xyz</code>
                    </p>
                </div>
            ) : (
                <>
                    <Faucet />
                    <form onSubmit={handleSubmit} className="space-y-6 bg-white border p-8 rounded-xl shadow-sm">

                        {/* File Upload */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">File to Gate</label>
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
                                <input
                                    type="file"
                                    onChange={handleFileChange}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                                <p className="mt-2 text-sm text-gray-500">
                                    {file ? <span className="text-black font-semibold">{file.name}</span> : "Click to upload or drag and drop"}
                                </p>
                            </div>
                        </div>

                        {/* Basic Info */}
                        <div className="grid grid-cols-1 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                                <input
                                    type="text"
                                    required
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                                    placeholder="Exclusive Content"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all h-24"
                                    placeholder="What's inside?"
                                />
                            </div>
                        </div>

                        <div className="border-t pt-6"></div>

                        {/* Access Rules */}
                        <div className="space-y-4">
                            <h3 className="font-semibold flex items-center gap-2">
                                <LinkIcon size={18} />
                                Pricing
                            </h3>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Price (APT)</label>
                                <input
                                    type="number"
                                    step="0.00000001"
                                    min="0"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                                    placeholder="0.1"
                                />
                                <p className="text-xs text-gray-500 mt-1">Set to 0 for free access.</p>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isUploading}
                            className="w-full py-4 bg-black text-white rounded-lg font-bold hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                        >
                            {isUploading ? "Creating Link..." : "Create Link"}
                        </button>
                    </form>
                </>
            )}
        </div>
    );
}
