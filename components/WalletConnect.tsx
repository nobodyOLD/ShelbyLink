"use client";

import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { LogOut, Wallet } from "lucide-react";
import { useState } from "react";

export function WalletConnect() {
    const { connect, disconnect, account, connected, wallets } = useWallet();
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (connected && account) {
        return (
            <div className="flex items-center gap-2">
                <span className="text-sm font-mono bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">
                    {account.address.toString().slice(0, 6)}...{account.address.toString().slice(-4)}
                </span>
                <button
                    onClick={disconnect}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600"
                    title="Disconnect"
                >
                    <LogOut size={16} />
                </button>
            </div>
        );
    }

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                className="px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
                <Wallet size={16} />
                Connect Wallet
            </button>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl animate-in fade-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-semibold mb-4">Connect Wallet</h3>
                        <div className="flex flex-col gap-2">
                            {wallets?.map((wallet) => (
                                <button
                                    key={wallet.name}
                                    onClick={() => {
                                        connect(wallet.name);
                                        setIsModalOpen(false);
                                    }}
                                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
                                >
                                    <span className="font-medium">{wallet.name}</span>
                                    <img src={wallet.icon} alt={wallet.name} className="w-6 h-6" />
                                </button>
                            ))}
                            {(!wallets || wallets.length === 0) && (
                                <p className="text-gray-500 text-sm text-center py-4">No wallets found. Please install Petra.</p>
                            )}
                        </div>
                        <button
                            onClick={() => setIsModalOpen(false)}
                            className="mt-4 w-full py-2 text-gray-500 hover:text-gray-700 font-medium"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
