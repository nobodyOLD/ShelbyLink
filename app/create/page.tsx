"use client";

import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Upload, Link as LinkIcon, AlertCircle } from "lucide-react";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

// Initialize Aptos client
import { uploadFileToShelby } from "../../lib/shelby";
const aptosConfig = new AptosConfig({ network: Network.DEVNET });
const aptos = new Aptos(aptosConfig);

// Contract address - Replace with actual address after deployment
// For now using the placeholder 0xc0ffee
const MODULE_ADDRESS = "0x124992510e07b1bc4a9ad7bfc7bb87381d2e473c1b30c01d11c96640f8582cb9";
const MODULE_NAME = "shelby_link_v2";

export default function CreateLinkPage() {
    const { account, signAndSubmitTransaction } = useWallet();
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState("0");
    const [isUploading, setIsUploading] = useState(false);
    const [txHash, setTxHash] = useState("");

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!account) return alert("Please connect wallet");
        if (!file) return alert("Please select a file");

        try {
            setIsUploading(true);

            // 1. Upload to Shelby
            const storageCid = await uploadFileToShelby(file);
            console.log("Uploaded to Shelby, CID:", storageCid);

            // 2. Submit Transaction with Retry
            const priceInOctas = Math.floor(parseFloat(price) * 100_000_000).toString();
            console.log("Creating link with price (octas):", priceInOctas);

            const submitWithRetry = async (attempts = 3): Promise<any> => {
                try {
                    return await signAndSubmitTransaction({
                        sender: account.address,
                        data: {
                            function: `${MODULE_ADDRESS}::${MODULE_NAME}::create_link`,
                            functionArguments: [title, description, storageCid, priceInOctas],
                        },
                    });
                } catch (err: any) {
                    const msg = err?.message || String(err);
                    console.warn(`Attempt failed (${attempts} left):`, msg);
                    if (attempts > 1 && (msg.includes("rate limit") || msg.includes("Unexpected token"))) {
                        await new Promise(r => setTimeout(r, 2000)); // Wait 2s
                        return submitWithRetry(attempts - 1);
                    }
                    throw err;
                }
            };

            const response = await submitWithRetry();

            console.log("Transaction submitted:", response.hash);
            const committedTxn = await aptos.waitForTransaction({ transactionHash: response.hash });

            // Attempt to find the created object address from changes
            let createdObjectAddress = "";
            if ("changes" in committedTxn) {
                const changes = committedTxn.changes;
                for (const change of changes) {
                    if (change.type === "write_resource" && "data" in change) {
                        const data = change.data as { type: string };
                        if (data.type === "0x1::object::ObjectGroup") {
                            // Safe cast or check if address exists
                            if ("address" in change) {
                                createdObjectAddress = (change as any).address;
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
            if (msg.includes("rate limit") || msg.includes("Simulation error") || msg.includes("Indexer") || msg.includes("Unexpected token '<'") || msg.includes("Unexpected token <")) {
                alert("Devnet is extremely busy. Auto-retry failed. Please wait 60 seconds and try again.");
            } else {
                alert("Failed to create link: " + msg);
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
            ) : (
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
            )}
        </div>
    );
}
