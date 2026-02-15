"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { Lock, Unlock, Download, AlertCircle, FileText } from "lucide-react";
import { getFileFromShelby } from "../../../lib/shelby";

// Initialize Aptos client
const aptosConfig = new AptosConfig({ network: Network.DEVNET });
const aptos = new Aptos(aptosConfig);

const MODULE_ADDRESS = "0x124992510e07b1bc4a9ad7bfc7bb87381d2e473c1b30c01d11c96640f8582cb9";
const MODULE_NAME = "shelby_link_v2";

interface LinkData {
    creator: string;
    title: string;
    description: string;
    storage_cid: string;
    price: string;
}

export default function LinkPage() {
    const { id } = useParams();
    const linkAddress = Array.isArray(id) ? id[0] : id;

    const { account, connected, signAndSubmitTransaction } = useWallet();
    const [linkData, setLinkData] = useState<LinkData | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasAccess, setHasAccess] = useState(false);
    const [checkingAccess, setCheckingAccess] = useState(false);
    const [error, setError] = useState("");
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        if (!linkAddress) return;

        const fetchLink = async () => {
            try {
                setLoading(true);
                const payload = {
                    function: `${MODULE_ADDRESS}::${MODULE_NAME}::get_link` as `${string}::${string}::${string}`,
                    functionArguments: [linkAddress],
                };

                // View function returns an array of values
                const result = await aptos.view({ payload });

                if (result && result.length >= 5) {
                    setLinkData({
                        creator: result[0] as string,
                        title: result[1] as string,
                        description: result[2] as string,
                        storage_cid: result[3] as string,
                        price: result[4] as string,
                    });
                } else {
                    setError("Invalid link data returned");
                }
            } catch (e: any) {
                console.error(e);
                const msg = e?.message || String(e);
                if (msg.includes("rate limit") || msg.includes("Indexer") || msg.includes("Unexpected token '<'") || msg.includes("Unexpected token <")) {
                    setError("Network Busy (Rate Limit/Gateway Error). Please refresh in a moment.");
                } else {
                    setError("Link not found or invalid address");
                }
            } finally {
                setLoading(false);
            }
        };

        fetchLink();
    }, [linkAddress]);

    const checkAccess = async () => {
        if (!account || !linkData) return;
        setCheckingAccess(true);
        try {
            // Check manual access via view function
            const payload = {
                function: `${MODULE_ADDRESS}::${MODULE_NAME}::has_access` as `${string}::${string}::${string}`,
                functionArguments: [linkAddress, account.address],
            };
            const [hasAccessResult] = await aptos.view({ payload });

            if (Array.isArray(hasAccessResult) && hasAccessResult[0]) {
                setHasAccess(true);
            } else {
                setHasAccess(false);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setCheckingAccess(false);
        }
    };

    const handleBuy = async () => {
        if (!account || !linkData) return;

        try {
            setCheckingAccess(true); // Re-use checking state for buying loading

            const response = await signAndSubmitTransaction({
                sender: account.address,
                data: {
                    function: `${MODULE_ADDRESS}::${MODULE_NAME}::pay_for_access`,
                    functionArguments: [linkAddress],
                },
            });

            await aptos.waitForTransaction({ transactionHash: response.hash });
            setHasAccess(true);
            alert("Payment successful! You now have access.");

        } catch (error: any) {
            console.error("Purchase error:", error);
            const msg = error?.message || String(error);
            if (msg.includes("rate limit") || msg.includes("Simulation error") || msg.includes("Indexer") || msg.includes("Unexpected token '<'") || msg.includes("Unexpected token <")) {
                alert("Devnet is busy (Rate Limit/Gateway Error). Please wait 30 seconds and try again.");
            } else {
                alert("Failed to purchase access: " + msg);
            }
        } finally {
            setCheckingAccess(false);
        }
    };

    const handleDownload = async () => {
        if (!linkData) return;
        setIsDownloading(true);
        try {
            const blob = await getFileFromShelby(linkData.storage_cid);
            if (blob) {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = linkData.title || "download";
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            } else {
                alert("Failed to retrieve file.");
            }
        } catch (e) {
            console.error(e);
            alert("Error downloading file.");
        } finally {
            setIsDownloading(false);
        }
    };

    // Check access when connected or linkData changes
    useEffect(() => {
        if (connected && account && linkData) {
            checkAccess();
        }
    }, [connected, account, linkData]);

    if (loading) return <div className="p-12 text-center">Loading link details...</div>;
    if (error) return <div className="p-12 text-center text-red-500">{error}</div>;
    if (!linkData) return null;

    const priceAPT = (Number(linkData.price) / 100_000_000).toFixed(2);

    return (
        <div className="max-w-xl mx-auto py-12 px-4">
            <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
                <div className="p-8 text-center border-b bg-gray-50">
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock size={32} />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">{linkData.title}</h1>
                    <p className="text-gray-600">{linkData.description}</p>
                </div>

                <div className="p-8 space-y-6">
                    <div className="bg-gray-50 rounded-lg p-4 text-sm">
                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                            <AlertCircle size={16} /> Access Requirement
                        </h3>
                        <p>
                            One-time payment of <strong>{priceAPT} APT</strong>
                        </p>
                    </div>

                    {!connected ? (
                        <div className="text-center py-4 text-amber-600 bg-amber-50 rounded-lg">
                            Please connect your wallet to unlock.
                        </div>
                    ) : hasAccess ? (
                        <div className="space-y-4">
                            <div className="bg-green-50 text-green-700 p-4 rounded-lg flex items-center gap-2 justify-center">
                                <Unlock size={20} /> Access Granted
                            </div>
                            <div className="border border-dashed border-green-200 bg-green-50/30 rounded-lg p-8 text-center">
                                <FileText size={48} className="mx-auto text-green-600 mb-4" />
                                <h3 className="font-bold mb-2">Content Unlocked</h3>
                                <p className="text-sm text-gray-500 mb-6">CID: {linkData.storage_cid}</p>

                                <button
                                    onClick={handleDownload}
                                    disabled={isDownloading}
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                                >
                                    {isDownloading ? (
                                        "Downloading..."
                                    ) : (
                                        <>
                                            <Download size={18} /> Download / View
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={handleBuy}
                            disabled={checkingAccess}
                            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {checkingAccess ? "Processing..." : `Buy Access for ${priceAPT} APT`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
