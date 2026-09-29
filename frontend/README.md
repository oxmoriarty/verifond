# Verifund Frontend

The modern, responsive Next.js frontend for Verifund - an autonomous Retroactive Public Goods Funding (RPGF) application built on GenLayer Intelligent Contracts.

## Tech Stack
- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS, PostCSS
- **State Management**: React Query (`@tanstack/react-query`)
- **Web3 Integration**: `genlayer-js`, MetaMask

## Features
- **Project Submission**: Submit public goods URLs to be intelligently evaluated and scored by the GenLayer AI consensus.
- **Project Directory**: Browse all evaluated projects with their Alpha/Beta/Gamma classification.
- **Deep Integration**: Seamlessly connect your wallet, copy your EOA address, and manage real-time evaluation states.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables in `.env.local` or `.env`:
   ```bash
   NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
   NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
   NEXT_PUBLIC_GENLAYER_CHAIN_NAME="GenLayer Studio Network"
   NEXT_PUBLIC_GENLAYER_SYMBOL=GEN
   NEXT_PUBLIC_EXPLORER_URL=https://explorer-studio.genlayer.com/
   NEXT_PUBLIC_CONTRACT_ADDRESS="your_deployed_rpgf_address_here"
   ```
   *Note: If `NEXT_PUBLIC_CONTRACT_ADDRESS` is set to `0x0000000000000000000000000000000000000000`, the app will load with mock data.*

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) with your browser.
