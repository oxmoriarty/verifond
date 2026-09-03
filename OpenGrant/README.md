# OpenGrant - Intelligent Contract

This standalone project contains a generalized intelligent contract designed for the [GenLayer network](https://genlayer.com). It leverages AI consensus to autonomously evaluate project submissions, verify builder identities, and dynamically allocate public goods funding without human intervention.

## 🌟 Key Features & Functions

1. **AI Identity Verification (`verify_builder_identity`)**
   - Eliminates sybil attacks by reading a developer's public profile (e.g. GitHub).
   - The GenLayer intelligent validators fetch the user's provided profile URL and confirm that the exact Ethereum wallet address is present in their bio.
   - Enforces a strict 1-to-1 mapping between a developer account and a Web3 wallet (`verified_builder_identities`).

2. **Autonomous Project Evaluation (`evaluate_and_submit_project`)**
   - Builders submit their code repository URL and project description.
   - Intelligent validators scrape the project website/repository and evaluate it against four core criteria:
     - Project Description Clarity (25%)
     - Resource Quality & Existence (30%)
     - Public Goods Impact (25%)
     - Feasibility & Execution (20%)
   - Generates a score (1-10) and automatically calculates an `allocated_funding_amount` of GEN tokens.
   - Prevents duplicate submissions and strictly verifies repository ownership using the linked developer account.

3. **Staked AI Jury & Dispute Timelock**
   - Implements a decentralized dispute resolution system to prevent plagiarism and copycat repos.
   - Anyone can become a jury reporter by calling `stake_for_jury`.
   - Approved projects are subject to a **Timelock (currently set to 1 day for testing)**. During this window, reporters can call `dispute_project` and provide evidence to the AI that the project is plagiarized. *(Note: You can easily change this to 7 days for production by adjusting the `dispute_window` multiplier in the `claim_allocated_funds` function).*
   - If the AI agrees, the project is slashed, and the reporter earns a **5 GEN bounty**. If the reporter submits a fake claim, they are slashed **2 GEN** to deter trolls.
   - **Front-Running Protection:** Implements the Checks-Effects-Interactions pattern to deduct penalties upfront, mathematically preventing malicious reporters from withdrawing their stakes while the AI evaluates their dispute.

4. **Trustless Payouts & Treasury**
   - Anyone can donate to the central treasury via the `fund_treasury` payable function.
   - **Decoupled Evaluation:** Projects can be evaluated and lock in an approved funding allocation even if the treasury is temporarily empty.
   - Approved builders can claim their allocated funds directly via the `claim_allocated_funds` function whenever sufficient funds are available in the treasury.

## 📖 API Reference

### State Variables
- `submitted_projects`: A map of all projects evaluated by the AI.
- `funding_treasury`: The total GEN token balance available for funding public goods.
- `verified_builder_identities`: A mapping of Wallet ↔ JSON dictionary of platforms (e.g. `{"github.com": "oxmoriarty", "gitlab.com": "oxmoriarty"}`). Allows a single wallet to securely link multiple identities.

### Core Functions
- `fund_treasury() -> None`: Payable function to donate to the public goods pool.
- `stake_for_jury() -> None`: Payable function to deposit GEN tokens into your standing jury balance.
- `withdraw_stake(amount_wei: u256) -> None`: Withdraw un-slashed GEN tokens from your jury balance.
- `verify_builder_identity(developer_profile_url: str) -> str`: Scans a profile URL using AI to locate the caller's wallet address.
- `update_builder_identity(new_developer_profile_url: str) -> str`: Allows migrating an existing linked identity.
- `evaluate_and_submit_project(..., requested_amount_gen: u256) -> u256`: AI autonomously evaluates the repository, assigns a score, and locks in a funding allocation.
- `dispute_project(project_id: u256, evidence_prompt: str) -> None`: Submits external evidence to the AI Jury to prove an approved project is plagiarized.
- `claim_allocated_funds(project_id: u256) -> None`: Distributes allocated tokens to the verified builder after the dispute timelock expires.

## 📁 Directory Structure

```
OpenGrant/
├── contracts/
│   └── OpenGrant.py       # Main Intelligent Contract
├── tests/
│   └── test_OpenGrant.py  # Test suite template
└── README.md              # This file
```

## 🚀 How to Deploy

1. Ensure you have the GenLayer CLI installed.
2. Initialize the project (if needed): `npx genlayer init`
3. Deploy the contract to the GenLayer testnet:
   ```bash
   npx genlayer deploy --contract contracts/OpenGrant.py
   ```

## 🧪 Testing

The contract relies on the `genlayer` Python SDK. You can write simulator tests using the GenLayer test framework.

```bash
# Example test command depending on your setup
pytest tests/
```

## 💡 About GenLayer
GenLayer is an intelligent blockchain platform that allows smart contracts to securely request and reach consensus on non-deterministic data, such as LLM outputs or live web scraping, directly at the consensus layer.
