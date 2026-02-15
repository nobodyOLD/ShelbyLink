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
    const isShelbyNetwork = walletNetwork?.url?.includes("shelbynet") || walletNetwork?.chainId?.toString() === "2026";

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    // Initialize Shelby Client
    const client = new ShelbyClient({
        apiKey: undefined,
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

            // Helper for custom polling to bypass SDK .json() crash (Aptos SDK workaround)
            const pollTransaction = async (hash: string) => {
                const startTime = Date.now();
                const timeout = 60000;
                console.log(`POLL START [${hash}]`);
                while (Date.now() - startTime < timeout) {
                    try {
                        const res = await fetch(`https://api.shelbynet.shelby.xyz/v1/transactions/by_hash/${hash}`);
                        const text = await res.text();
                        console.log(`POLL DEBUG [${hash.slice(0, 10)}]: status ${res.status}, body len: ${text.length}`);
                        if (res.ok && text) {
                            const json = JSON.parse(text);
                            if (json.type !== "pending_transaction") {
                                console.log(`POLL SUCCESS [${hash.slice(0, 10)}]`);
                                return json;
                            }
                        }
                    } catch (e) {
                        console.warn("Poll attempt failed:", e);
                    }
                    await new Promise(r => setTimeout(r, 2000));
                }
                throw new Error("Transaction timeout or polling error after 60s");
            };

            // Helper for safe putBlob to bypass SDK .json() crash on empty responses (Shelby SDK workaround)
            const safePutBlob = async (name: string, data: Uint8Array) => {
                const baseUrl = "https://api.shelbynet.shelby.xyz/shelby/";
                const totalBytes = data.length;
                const partSize = 5 * 1024 * 1024;

                console.log("STEP: Safe Upload starting...");
                const startRes = await fetch(`${baseUrl}v1/multipart-uploads`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        rawAccount: account!.address.toString(),
                        rawBlobName: name,
                        rawPartSize: partSize
                    })
                });

                if (!startRes.ok) throw new Error(`Start upload failed: ${startRes.status} ${await startRes.text()}`);
                const startData = JSON.parse(await startRes.text());
                const uploadId = startData.uploadId;

                const totalParts = Math.ceil(totalBytes / partSize);
                for (let i = 0; i < totalParts; i++) {
                    const start = i * partSize;
                    const end = Math.min(start + partSize, totalBytes);
                    const chunk = data.subarray(start, end);

                    console.log(`STEP: Uploading part ${i + 1}/${totalParts}`);
                    const partRes = await fetch(`${baseUrl}v1/multipart-uploads/${uploadId}/parts/${i}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/octet-stream" },
                        body: chunk as any // Cast to any to avoid BodyInit lint in some TS environments
                    });
                    if (!partRes.ok) throw new Error(`Part ${i} failed: ${partRes.status} ${await partRes.text()}`);
                }

                console.log("STEP: Finalizing upload...");
                const completeRes = await fetch(`${baseUrl}v1/multipart-uploads/${uploadId}/complete`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" }
                });
                if (!completeRes.ok) throw new Error(`Complete failed: ${completeRes.status} ${await completeRes.text()}`);
            };

            const blobName = `${Date.now()}-${file.name}`;
            console.log("STEP: Starting upload...");
            (window as any).lastStep = "ArrayBuffer";
            const blobData = new Uint8Array(await file.arrayBuffer());

            // A. Generate Commitments
            console.log("STEP: Generating commitments...");
            (window as any).lastStep = "ECProvider";
            const provider = await ClayErasureCodingProvider.create();
            (window as any).lastStep = "Commitments";
            const blobCommitments = await generateCommitments(provider, blobData);

            // B. Register Blob on-chain
            console.log("STEP: Registering blob on-chain...");
            (window as any).lastStep = "Payload";
            const registerPayload = ShelbyBlobClient.createRegisterBlobPayload({
                deployer: undefined,
                account: undefined as any,
                useSponsoredUsdVariant: false,
                blobName,
                blobSize: blobData.length,
                blobMerkleRoot: blobCommitments.blob_merkle_root,
                expirationMicros: Date.now() * 1000 + 3600_000_000,
                numChunksets: blobCommitments.chunkset_commitments.length,
            });

            (window as any).lastStep = "SignReg";
            const registrationResponse = await signAndSubmitTransaction({
                sender: account.address,
                data: registerPayload as any
            });

            console.log("STEP: Registration submitted:", registrationResponse.hash);
            (window as any).lastStep = "WaitReg";
            await pollTransaction(registrationResponse.hash);
            console.log("STEP: Registration confirmed");

            // C. Upload to Storage RPC
            console.log("STEP: Putting blob to storage RPC...");
            (window as any).lastStep = "PutBlob";
            await safePutBlob(blobName, blobData);

            // 2. Create Link Contract Call
            const storageCid = `${account.address}/${blobName}`;
            const priceInOctas = Math.floor(parseFloat(price) * 100_000_000).toString();
            console.log("STEP: Creating link...");
            (window as any).lastStep = "SignLink";

            const response = await signAndSubmitTransaction({
                sender: account.address,
                data: {
                    function: `${MODULE_ADDRESS}::${MODULE_NAME}::create_link`,
                    functionArguments: [title, description, storageCid, priceInOctas],
                },
            });

            console.log("STEP: Create Link submitted:", response.hash);
            (window as any).lastStep = "WaitLink";

            const committedTxn = await pollTransaction(response.hash);
            (window as any).lastStep = "Done";

            // Attempt to find the created object address
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

            setTxHash(createdObjectAddress || response.hash);

        } catch (error: any) {
            console.error("Error creating link:", error);
            const msg = error?.message || String(error);
            const lastStep = (window as any).lastStep || "unknown";
            if (msg.includes("rejected")) {
                alert("Transaction rejected. Please approve in your wallet.");
            } else {
                alert(`Failed at step [${lastStep}]: ` + msg);
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
                <p className="text-gray-600 max-w-md">Your paid link is ready.</p>
                <div className="bg-gray-100 p-4 rounded-lg break-all font-mono text-sm max-w-lg">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/l/{txHash}
                </div>
                <a href={`/l/${txHash}`} className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors">
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
                        Please switch your wallet to <strong>Shelby Devnet</strong>.
                        <br />
                        RPC: <code>https://api.shelbynet.shelby.xyz</code>
                    </p>
                </div>
            ) : (
                <>
                    <Faucet />
                    <form onSubmit={handleSubmit} className="space-y-6 bg-white border p-8 rounded-xl shadow-sm">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">File to Gate</label>
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
                                <input type="file" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                                <p className="mt-2 text-sm text-gray-500">
                                    {file ? <span className="text-black font-semibold">{file.name}</span> : "Click to upload or drag and drop"}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                                <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none" placeholder="Exclusive Content" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none h-24" placeholder="What's inside?" />
                            </div>
                        </div>

                        <div className="border-t pt-6"></div>

                        <div className="space-y-4">
                            <h3 className="font-semibold flex items-center gap-2"><LinkIcon size={18} />Pricing</h3>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Price (APT)</label>
                                <input type="number" step="0.00000001" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none" placeholder="0.1" />
                            </div>
                        </div>

                        <button type="submit" disabled={isUploading} className="w-full py-4 bg-black text-white rounded-lg font-bold hover:bg-gray-800 transition-all disabled:opacity-50 mt-4">
                            {isUploading ? "Creating Link..." : "Create Link"}
                        </button>
                    </form>
                </>
            )}
        </div>
    );
}
