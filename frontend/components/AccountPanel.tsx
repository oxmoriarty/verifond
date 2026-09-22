"use client";

import { useState } from "react";
import { User, LogOut, AlertCircle, ExternalLink, Wallet } from "lucide-react";
import { useWallet } from "@/lib/genlayer/wallet";
import { userRejected } from "@/lib/utils/toast";
import { AddressDisplay } from "./AddressDisplay";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

const METAMASK_INSTALL_URL = "https://metamask.io/download/";

export function AccountPanel() {
  const {
    address,
    isConnected,
    isMetaMaskInstalled,
    isOnCorrectNetwork,
    isLoading,
    connectWallet,
    disconnectWallet,
    switchWalletAccount,
  } = useWallet();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const handleConnect = async () => {
    if (!isMetaMaskInstalled) return;

    try {
      setIsConnecting(true);
      setConnectionError("");
      await connectWallet();
      setIsModalOpen(false);
    } catch (err: any) {
      setConnectionError(err.message || "Failed to connect to MetaMask");
      if (err.message?.includes("rejected")) {
        userRejected("Connection cancelled");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    setIsModalOpen(false);
  };

  const handleSwitchAccount = async () => {
    try {
      setIsSwitching(true);
      setConnectionError("");
      await switchWalletAccount();
    } catch (err: any) {
      if (!err.message?.includes("rejected")) {
        setConnectionError(err.message || "Failed to switch account");
      } else {
        userRejected("Account switch cancelled");
      }
    } finally {
      setIsSwitching(false);
    }
  };

  if (!isConnected) {
    return (
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogTrigger asChild>
          <button disabled={isLoading} className="btn-primary flex items-center shadow-[0_0_15px_rgba(133,23,255,0.2)]">
            <Wallet className="w-4 h-4 mr-2" />
            Connect Wallet
          </button>
        </DialogTrigger>
        <DialogContent className="glass-card border-border border-2">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Connect Wallet</DialogTitle>
            <DialogDescription>Connect your Web3 wallet to submit and evaluate projects.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {!isMetaMaskInstalled ? (
              <>
                <Alert className="bg-destructive/10 border-destructive/20 text-destructive-foreground">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Wallet Not Detected</AlertTitle>
                  <AlertDescription>Please install a compatible Web3 wallet (e.g. MetaMask) to continue.</AlertDescription>
                </Alert>
                <button onClick={() => window.open(METAMASK_INSTALL_URL, "_blank")} className="btn-primary w-full flex items-center justify-center h-12">
                  <ExternalLink className="w-5 h-5 mr-2" /> Install MetaMask
                </button>
              </>
            ) : (
              <>
                <button onClick={handleConnect} disabled={isConnecting} className="btn-primary w-full flex items-center justify-center h-12">
                  <Wallet className="w-5 h-5 mr-2" />
                  {isConnecting ? "Connecting..." : "Connect via MetaMask"}
                </button>

                {connectionError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Connection Error</AlertTitle>
                    <AlertDescription>{connectionError}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <div className="flex items-center gap-3">
        <DialogTrigger asChild>
          <button className="glass-card px-4 py-2 flex items-center gap-2 hover:border-primary/50 transition-colors">
            <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)] animate-pulse" />
            <AddressDisplay address={address} maxLength={8} className="font-medium tracking-tight text-sm" showCopy={false} />
          </button>
        </DialogTrigger>
      </div>

      <DialogContent className="glass-card border-2">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Account</DialogTitle>
          <DialogDescription>Manage your connected wallet session.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="bg-black/20 rounded-xl p-4 border border-white/5 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Connected Address</p>
            <code className="text-sm font-mono text-primary break-all">{address}</code>
          </div>

          {!isOnCorrectNetwork && (
            <Alert className="bg-yellow-500/10 border-yellow-500/20 text-yellow-500">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Network Warning</AlertTitle>
              <AlertDescription>You are not on the GenLayer Studio Network. Please switch networks to interact with Verifund.</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={handleSwitchAccount} disabled={isSwitching || isLoading} className="btn-secondary flex-1 flex items-center justify-center">
              <User className="w-4 h-4 mr-2" /> {isSwitching ? "..." : "Switch"}
            </button>
            <button onClick={handleDisconnect} disabled={isSwitching || isLoading} className="btn-secondary flex-1 flex items-center justify-center text-destructive hover:border-destructive/50">
              <LogOut className="w-4 h-4 mr-2" /> Disconnect
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
