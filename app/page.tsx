import Link from "next/link";
import { ArrowRight, Shield, Upload, Link as LinkIcon } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center space-y-8">
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-5xl font-extrabold tracking-tight">
          Share content. <br />
          <span className="text-blue-600">Gate with tokens.</span>
        </h1>
        <p className="text-xl text-gray-500">
          The decentralized way to share exclusive files.
          Require Aptos NFTs or coins to unlock your links.
        </p>
      </div>

      <div className="flex gap-4">
        <Link
          href="/create"
          className="px-8 py-4 bg-black text-white rounded-full font-bold hover:bg-gray-800 transition-all flex items-center gap-2"
        >
          Create Link <ArrowRight size={20} />
        </Link>
        <a
          href="https://shelby.io"
          target="_blank"
          className="px-8 py-4 bg-gray-100 text-gray-900 rounded-full font-bold hover:bg-gray-200 transition-all"
        >
          Learn More
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16 text-left max-w-4xl">
        <div className="p-6 bg-gray-50 rounded-2xl">
          <Upload className="w-10 h-10 mb-4 text-gray-700" />
          <h3 className="font-bold text-lg mb-2">Upload Files</h3>
          <p className="text-gray-500">Store your content securely on Shelby decentralized storage.</p>
        </div>
        <div className="p-6 bg-gray-50 rounded-2xl">
          <Shield className="w-10 h-10 mb-4 text-gray-700" />
          <h3 className="font-bold text-lg mb-2">Set Rules</h3>
          <p className="text-gray-500">Gate access by NFT ownership or minimum token balance.</p>
        </div>
        <div className="p-6 bg-gray-50 rounded-2xl">
          <LinkIcon className="w-10 h-10 mb-4 text-gray-700" />
          <h3 className="font-bold text-lg mb-2">Share Link</h3>
          <p className="text-gray-500">Send the link to your community. Only holders can unlock.</p>
        </div>
      </div>
    </div>
  );
}
