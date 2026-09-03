# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
import time
from dataclasses import dataclass
from genlayer import *


@allow_storage
@dataclass
class ProjectEvaluation:
    submitter_wallet: Address
    project_name: str
    project_description: str
    repository_url: str
    requested_funding_amount: u256
    evaluation_status: str
    evaluation_reason: str
    evaluation_score: u256
    funds_claimed: bool
    allocated_funding_amount: u256
    identified_strengths: str
    identified_weaknesses: str
    approval_timestamp: u256

class OpenGrant(gl.Contract):
    # State variables for RPGF
    submitted_projects: TreeMap[u256, ProjectEvaluation]
    next_project_id: u256
    funding_treasury: u256

    # State variables for Jury Staking
    staked_deposits: TreeMap[str, u256] # Wallet Hex -> Staked GEN in WEI

    # State variables for Identity & Deduplication
    verified_builder_identities: TreeMap[str, str] # Wallet Hex -> JSON dictionary of platforms e.g. {"github.com": "oxmoriarty", "gitlab.com": "john"}
    verified_builder_wallets: TreeMap[str, str] # platform.com/username -> Wallet Hex
    verified_builder_numeric_ids: TreeMap[str, str] # platform.com/numeric_user_id -> Wallet Hex
    project_submission_attempts: TreeMap[str, u256] # Repository URL -> Number of Attempts (999 means Approved)
    project_submitted_numeric_ids: TreeMap[str, u256] # platform.com/numeric_repo_id -> Number of Attempts

    def __init__(self):
        self.next_project_id = u256(1)
        self.funding_treasury = u256(0)

    @gl.public.write.payable
    def fund_treasury(self) -> None:
        """Anyone can donate GEN tokens to the public goods funding treasury."""
        donation_amount = gl.message.value
        if donation_amount > u256(0):
            self.funding_treasury += donation_amount

    @gl.public.write.payable
    def stake_for_jury(self) -> None:
        """Deposit GEN tokens to become a registered jury member and submit disputes."""
        stake_amount = gl.message.value
        if stake_amount == u256(0):
            raise gl.vm.UserError("Must send GEN tokens to stake.")
        
        caller = gl.message.sender_address.as_hex.lower()
        current_stake = self.staked_deposits.get(caller, u256(0))
        self.staked_deposits[caller] = current_stake + stake_amount

    @gl.public.write
    def withdraw_stake(self, amount_wei: u256) -> None:
        """Withdraw your un-slashed GEN tokens from your jury stake."""
        caller = gl.message.sender_address.as_hex.lower()
        current_stake = self.staked_deposits.get(caller, u256(0))
        
        if amount_wei > current_stake:
            raise gl.vm.UserError("Insufficient staked balance.")
            
        self.staked_deposits[caller] = current_stake - amount_wei
        _Recipient(gl.message.sender_address).emit_transfer(value=amount_wei)

    @gl.public.write
    def dispute_project(self, project_id: u256, evidence_prompt: str) -> None:
        """
        Dispute an approved project for plagiarism or malicious duplicate.
        Requires a minimum standing stake of 10 GEN.
        - Slash penalty for trolls: -2 GEN
        - Reward bounty for correct reports: +5 GEN
        """
        caller = gl.message.sender_address.as_hex.lower()
        current_stake = self.staked_deposits.get(caller, u256(0))
        
        min_stake_required = u256(10) * (u256(10) ** u256(18))
        if current_stake < min_stake_required:
            raise gl.vm.UserError("Must have a minimum standing stake of 10 GEN to submit a dispute.")
            
        if project_id not in self.submitted_projects:
            raise gl.vm.UserError("Project not found.")
            
        project = self.submitted_projects[project_id]
        
        if project.evaluation_status != "Approved":
            raise gl.vm.UserError("Can only dispute approved projects.")
            
        if project.funds_claimed:
            raise gl.vm.UserError("Funds have already been claimed. Dispute window is closed.")
            
        penalty_amount = u256(2) * (u256(10) ** u256(18))
        
        # DEDUCT PENALTY UPFRONT (Checks-Effects-Interactions Pattern)
        # This completely prevents a user from trying to withdraw their stake while the AI evaluates.
        self.staked_deposits[caller] = current_stake - penalty_amount
            
        # The AI Trial
        dispute_task = f"""
        You are a decentralized AI Judge. A reporter has submitted a dispute claiming that this approved project is plagiarized, a copycat, or malicious.
        
        Project Details:
        Name: {project.project_name}
        Description: {project.project_description}
        URL: {project.repository_url}
        
        Reporter's Evidence:
        {evidence_prompt}
        
        Your Task:
        1. Review the reporter's evidence carefully. Browse any external URLs they provided if possible.
        2. Compare the evidence against the project's repository URL.
        3. Determine if the project is a lazy plagiarized copy, a malicious double-dip, or legitimately violates public goods funding rules.
        
        Return a JSON object with:
        - "is_valid_dispute": boolean (true if the project is indeed plagiarized/malicious)
        - "judge_reasoning": string (explain your verdict)
        """
        
        validation_criteria = "Must return a valid JSON object with 'is_valid_dispute' (bool) and 'judge_reasoning' (string)."
        
        def fetch_dispute_context():
            return f"Executing dispute trial for project: {project.project_name}."
            
        ai_verdict_str = gl.eq_principle.prompt_non_comparative(fetch_dispute_context, task=dispute_task, criteria=validation_criteria)
        
        # Parse JSON
        if isinstance(ai_verdict_str, str):
            ai_verdict_str = ai_verdict_str.strip()
            if ai_verdict_str.startswith("```json"): ai_verdict_str = ai_verdict_str[7:]
            elif ai_verdict_str.startswith("```"): ai_verdict_str = ai_verdict_str[3:]
            if ai_verdict_str.endswith("```"): ai_verdict_str = ai_verdict_str[:-3]
            try:
                ai_verdict = json.loads(ai_verdict_str.strip())
            except Exception:
                raise gl.vm.UserError("Failed to parse AI Judge evaluation.")
        else:
            ai_verdict = ai_verdict_str
            
        if not isinstance(ai_verdict, dict):
            raise gl.vm.UserError("Invalid AI Judge response format.")
            
        is_valid = ai_verdict.get("is_valid_dispute", False)
        
        if is_valid:
            # Reporter wins! Slash the project.
            project.evaluation_status = "Rejected"
            project.evaluation_reason = "Project slashed by AI Jury: " + ai_verdict.get("judge_reasoning", "Plagiarism detected.")
            
            # The allocated funds go back to treasury
            slashed_funds = project.allocated_funding_amount
            project.allocated_funding_amount = u256(0)
            self.submitted_projects[project_id] = project
            
            bounty_amount = u256(5) * (u256(10) ** u256(18))
            
            if slashed_funds >= bounty_amount:
                # Refund their upfront penalty AND add the bounty!
                self.staked_deposits[caller] = self.staked_deposits[caller] + penalty_amount + bounty_amount
                # Remaining goes back to treasury
                self.funding_treasury += (slashed_funds - bounty_amount)
            else:
                # Refund their upfront penalty AND give whatever the project had
                self.staked_deposits[caller] = self.staked_deposits[caller] + penalty_amount + slashed_funds
        else:
            # Reporter loses! The penalty was already deducted upfront.
            # We just need to move that deducted penalty into the public treasury.
            self.funding_treasury += penalty_amount

    @gl.public.write
    def verify_builder_identity(self, developer_profile_url: str) -> str:
        """
        Uses GenLayer AI to scan a public developer profile URL (GitHub, GitLab, BitBucket) and verify if the caller's 
        wallet address is present in the bio. Allows linking multiple platforms to a single wallet.
        """
        caller_wallet = gl.message.sender_address.as_hex.lower()
        return self._execute_ai_identity_verification(caller_wallet, developer_profile_url, is_updating_identity=False)

    @gl.public.write
    def update_builder_identity(self, new_developer_profile_url: str) -> str:
        """
        Allows a user to migrate an existing linked developer identity to a new username on the same platform.
        """
        caller_wallet = gl.message.sender_address.as_hex.lower()
        return self._execute_ai_identity_verification(caller_wallet, new_developer_profile_url, is_updating_identity=True)

    def _execute_ai_identity_verification(self, caller_wallet: str, developer_profile_url: str, is_updating_identity: bool) -> str:
        
        # Deterministically extract the domain to prevent cross-platform namespace collisions
        clean_url = developer_profile_url.replace("http://", "").replace("https://", "").rstrip("/")
        domain = clean_url.split("/")[0].lower()
        allowed_domains = ["github.com", "gitlab.com", "bitbucket.org"]
        
        if domain not in allowed_domains:
            raise gl.vm.UserError(f"Unsupported profile platform. Supported: {', '.join(allowed_domains)}")

        # Fetch currently linked platforms for this wallet
        existing_identities_str = ""
        if caller_wallet in self.verified_builder_identities:
            existing_identities_str = self.verified_builder_identities[caller_wallet]
            
        try:
            identities = json.loads(existing_identities_str) if existing_identities_str else {}
        except Exception:
            identities = {}

        if not is_updating_identity and domain in identities:
            raise gl.vm.UserError(f"Your wallet is already linked to a {domain} identity.")
            
        if is_updating_identity and domain not in identities:
            raise gl.vm.UserError(f"Your wallet is not linked to {domain} yet. Please verify normally instead of updating.")

        verification_task = f"""
        You are a decentralized identity verifier. A builder is attempting to link their developer account (GitHub, GitLab, or Bitbucket) to their Web3 wallet.
        
        Your task:
        1. Scan the text content of the provided profile webpage.
        2. Look for the EXACT Ethereum wallet address: {caller_wallet}
        3. The address must be visibly present in the content (e.g., in their bio or pinned text).
        4. Extract the user's unique username from the profile URL.
        
        Return a JSON object with:
        - "is_verified": boolean (true if the exact address is found)
        - "extracted_username": string (the extracted username, or empty string if failed)
        - "extracted_numeric_id": integer (the unique numeric ID from the platform API, or 0)
        - "failure_reason": string
        """
        
        validation_criteria = "Must return a valid JSON object with 'is_verified' (bool), 'extracted_username' (string), 'extracted_numeric_id' (int), and 'failure_reason' (string)."
        
        def fetch_profile_webpage():
            try:
                page_content = gl.nondet.web.render(developer_profile_url, mode='text')
            except Exception:
                page_content = f"Failed to fetch webpage content for {developer_profile_url}."
                
            try:
                api_content = ""
                if domain == "github.com":
                    parts = developer_profile_url.replace("http://", "").replace("https://", "").rstrip("/").split("/")
                    username = parts[-1] if len(parts) > 1 else ""
                    if username:
                        api_content = gl.nondet.web.render(f"https://api.github.com/users/{username}", mode='text')
            except Exception:
                api_content = "Failed to fetch API data."
                
            return f"Profile URL: {developer_profile_url}\n\nAPI Data:\n{api_content}\n\nWebpage Content:\n{page_content}"

        ai_verification_result = gl.eq_principle.prompt_non_comparative(fetch_profile_webpage, task=verification_task, criteria=validation_criteria)
        
        # Parse JSON safely
        if isinstance(ai_verification_result, str):
            ai_verification_result = ai_verification_result.strip()
            if ai_verification_result.startswith("```json"): ai_verification_result = ai_verification_result[7:]
            elif ai_verification_result.startswith("```"): ai_verification_result = ai_verification_result[3:]
            if ai_verification_result.endswith("```"): ai_verification_result = ai_verification_result[:-3]
            try:
                parsed_result = json.loads(ai_verification_result.strip())
            except Exception:
                raise gl.vm.UserError("Failed to parse AI evaluation.")
        else:
            parsed_result = ai_verification_result
            
        if not isinstance(parsed_result, dict) or not parsed_result.get("is_verified"):
            raise gl.vm.UserError(f"Verification failed: {parsed_result.get('failure_reason', 'Wallet not found in bio')}")
            
        verified_username = parsed_result.get("extracted_username", "").strip().lower()
        if not verified_username:
            raise gl.vm.UserError("Verification failed: Could not extract username.")
            
        numeric_id_raw = parsed_result.get("extracted_numeric_id", 0)
        numeric_id = u256(numeric_id_raw) if isinstance(numeric_id_raw, int) and numeric_id_raw > 0 else u256(0)
        
        # We enforce numeric ID strictly for github.com
        if domain == "github.com" and numeric_id == u256(0):
            raise gl.vm.UserError("Verification failed: Could not establish numeric user ID.")
            
        # Bind the username directly to the platform domain (e.g. github.com/oxmoriarty)
        platform_identity = f"{domain}/{verified_username}"
        platform_numeric_identity = f"{domain}/{numeric_id}"
            
        # Strict 1-to-1 enforcement per platform identity
        if platform_identity in self.verified_builder_wallets and self.verified_builder_wallets[platform_identity] != caller_wallet:
            raise gl.vm.UserError(f"The identity '{platform_identity}' is already linked to another wallet.")
            
        if domain == "github.com" and platform_numeric_identity in self.verified_builder_numeric_ids and self.verified_builder_numeric_ids[platform_numeric_identity] != caller_wallet:
            raise gl.vm.UserError(f"The numeric identity '{platform_numeric_identity}' is already linked to another wallet.")

        if is_updating_identity:
            # Free up the old identity globally
            previous_username = identities[domain]
            previous_platform_identity = f"{domain}/{previous_username}"
            if previous_platform_identity in self.verified_builder_wallets:
                del self.verified_builder_wallets[previous_platform_identity]

        # Save the mapping
        identities[domain] = verified_username
        self.verified_builder_identities[caller_wallet] = json.dumps(identities)
        self.verified_builder_wallets[platform_identity] = caller_wallet
        if numeric_id > u256(0):
            self.verified_builder_numeric_ids[platform_numeric_identity] = caller_wallet
        
        return platform_identity

    @gl.public.write
    def evaluate_and_submit_project(self, project_name: str, project_description: str, repository_url: str, requested_amount_gen: u256) -> u256:
        """Evaluates a project using GenLayer AI and automatically scores and allocates funding."""
        
        caller_wallet = gl.message.sender_address.as_hex.lower()
            
        repository_url = repository_url.strip().lower()
        
        # Normalize URL to prevent bypasses
        normalized_url = repository_url.replace("http://", "").replace("https://", "")
        if normalized_url.endswith(".git"):
            normalized_url = normalized_url[:-4]
        normalized_url = normalized_url.rstrip("/")
        
        url_parts = normalized_url.split("/")
        allowed_domains = ["github.com", "gitlab.com", "bitbucket.org"]
        if len(url_parts) < 2 or url_parts[0] not in allowed_domains:
            raise gl.vm.UserError(f"Invalid code repository URL. Supported platforms: {', '.join(allowed_domains)}")
            
        domain = url_parts[0]
        repository_owner = url_parts[1].strip()
        repository_name = url_parts[2].strip() if len(url_parts) > 2 else ""
        
        # Verify the user has linked this specific platform
        existing_identities_str = ""
        if caller_wallet in self.verified_builder_identities:
            existing_identities_str = self.verified_builder_identities[caller_wallet]
            
        try:
            identities = json.loads(existing_identities_str) if existing_identities_str else {}
        except Exception:
            identities = {}
            
        if domain not in identities:
            raise gl.vm.UserError(f"You must verify and link your {domain} identity before submitting a project from this platform.")
            
        verified_username_for_domain = identities[domain]
        if repository_owner != verified_username_for_domain:
            raise gl.vm.UserError(f"Ownership unverified. You are verified as '{verified_username_for_domain}' on {domain}, but this repo belongs to '{repository_owner}'.")
        
        project_unique_repository = f"{domain}/{repository_owner}/{repository_name}"
        
        if project_unique_repository in self.project_submission_attempts:
            previous_attempts = int(self.project_submission_attempts[project_unique_repository])
            if previous_attempts == 999:
                raise gl.vm.UserError("This project repository has already been approved and cannot be submitted again.")
            if previous_attempts >= 3:
                raise gl.vm.UserError("This project repository has been rejected 3 times and is permanently locked from future submissions.")
            
        if requested_amount_gen == u256(0):
            raise gl.vm.UserError("Requested funding amount must be at least 1 GEN.")
            
        requested_amount_wei = requested_amount_gen * (u256(10) ** u256(18))
        requested_amount_in_gen = int(requested_amount_gen)

        evaluation_task = f"""
        Evaluate this project submission for Retroactive Public Goods Funding (RPGF).
        You must evaluate based on 4 criteria:
        A. Project Description (25%): Clearly explains problem, solution, users, and impact. Reject one-word or generic descriptions.
        B. Resource Quality (30%): Verify the resource exists, has meaningful content/code, and relates to the project. Reject fake, placeholder, or empty repos.
        C. Public Goods Impact (25%): Must provide public value (open source, education, research, infra). Penalize purely commercial apps.
        D. Feasibility and Execution (20%): Must appear realistic with evidence of work.
        
        Minimum Requirements (If any fail, set score <= 4 and status 'Rejected'):
        - Description lacks meaningful info.
        - Repository/Resource does not exist or is inaccessible.
        - Repository is empty or only a template.
        - Resource clearly does not relate to the project.

        Scoring Guide (1-10):
        0-4: Reject
        5-7: Approve (meets minimums)
        8-10: Strong Approval
        
        Funding Allocation:
        The submitter has requested a total of {requested_amount_in_gen} GEN tokens.
        Calculate 'suggested_funding_allocation' (an integer representing the exact number of GEN tokens to award).
        - If 'Rejected', this MUST be 0.
        - If 'Approved', you should allocate an amount up to {requested_amount_in_gen} GEN depending on the project's verified quality and impact. Do NOT exceed the requested amount.
        
        Corroboration:
        Carefully compare the submitted project description against the actual repository content. If the repository content does not corroborate the claims made, heavily penalize the score and allocation.
        
        Return a JSON object with:
        - "evaluation_score": integer
        - "evaluation_status": "Approved" or "Rejected"
        - "evaluation_reason": string
        - "suggested_funding_allocation": integer
        - "repo_id": integer (numeric GitHub repository ID from API metadata, or 0)
        - "repo_owner_id": integer (numeric GitHub user ID of the repository owner from API data, or 0)
        - "identified_strengths": ["list of strings"]
        - "identified_weaknesses": ["list of strings"]
        """
        validation_criteria = "Must return a valid JSON object with 'evaluation_score' (int), 'evaluation_status' ('Approved' or 'Rejected'), 'evaluation_reason' (string), 'suggested_funding_allocation' (int), 'repo_id' (int), 'repo_owner_id' (int), 'identified_strengths' (list of strings), 'identified_weaknesses' (list of strings)."
        
        def fetch_repository_webpage():
            try:
                page_content = gl.nondet.web.render(repository_url, mode='text')
            except Exception as e:
                page_content = f"Failed to fetch website content: The URL provided may be invalid or unreachable."
            
            try:
                api_content = ""
                if domain == "github.com":
                    api_content = gl.nondet.web.render(f"https://api.github.com/repos/{repository_owner}/{repository_name}", mode='text')
            except Exception:
                api_content = "Failed to fetch GitHub API data."

            return f"Project Name: {project_name}\nDescription: {project_description}\nRequested Amount: {requested_amount_in_gen} GEN\n\nGitHub API Repo Data:\n{api_content}\n\nRepository Content:\n{page_content}"

        ai_evaluation_result = gl.eq_principle.prompt_non_comparative(
            fetch_repository_webpage,
            task=evaluation_task,
            criteria=validation_criteria
        )
        
        # Robust JSON parsing
        if isinstance(ai_evaluation_result, str):
            ai_evaluation_result = ai_evaluation_result.strip()
            if ai_evaluation_result.startswith("```json"):
                ai_evaluation_result = ai_evaluation_result[7:]
            elif ai_evaluation_result.startswith("```"):
                ai_evaluation_result = ai_evaluation_result[3:]
            if ai_evaluation_result.endswith("```"):
                ai_evaluation_result = ai_evaluation_result[:-3]
            ai_evaluation_result = ai_evaluation_result.strip()
            
            try:
                ai_evaluation_result = json.loads(ai_evaluation_result)
            except Exception:
                start_idx = ai_evaluation_result.find('{')
                end_idx = ai_evaluation_result.rfind('}')
                if start_idx != -1 and end_idx != -1:
                    try:
                        ai_evaluation_result = json.loads(ai_evaluation_result[start_idx:end_idx+1])
                    except Exception:
                        ai_evaluation_result = {}
                else:
                    ai_evaluation_result = {}

        if not isinstance(ai_evaluation_result, dict):
            ai_evaluation_result = {}

        final_score = ai_evaluation_result.get("evaluation_score", 1)
        final_status = ai_evaluation_result.get("evaluation_status", "Rejected")
        final_reason = ai_evaluation_result.get("evaluation_reason", "Evaluation failed.")
        allocated_gen_tokens = ai_evaluation_result.get("suggested_funding_allocation", 0)
        repo_id_raw = ai_evaluation_result.get("repo_id", 0)
        repo_owner_id_raw = ai_evaluation_result.get("repo_owner_id", 0)
        project_strengths = ai_evaluation_result.get("identified_strengths", [])
        project_weaknesses = ai_evaluation_result.get("identified_weaknesses", [])
        
        repo_id = u256(repo_id_raw) if isinstance(repo_id_raw, int) and repo_id_raw > 0 else u256(0)
        repo_owner_id = u256(repo_owner_id_raw) if isinstance(repo_owner_id_raw, int) and repo_owner_id_raw > 0 else u256(0)

        if domain == "github.com":
            if repo_id == u256(0):
                raise gl.vm.UserError("Failed to extract numeric repository ID. This is required to prevent duplicates.")
            if repo_owner_id == u256(0):
                raise gl.vm.UserError("Failed to extract numeric repository owner ID.")
                
            platform_numeric_identity = f"{domain}/{repo_owner_id}"
            if platform_numeric_identity not in self.verified_builder_numeric_ids or self.verified_builder_numeric_ids[platform_numeric_identity] != gl.message.sender_address.as_hex.lower():
                raise gl.vm.UserError("Ownership unverified: The numeric User ID of this repository's owner does not match your linked identity.")
            
            platform_numeric_repo = f"{domain}/{repo_id}"
            if platform_numeric_repo in self.project_submitted_numeric_ids:
                attempts_by_id = int(self.project_submitted_numeric_ids[platform_numeric_repo])
                if attempts_by_id == 999:
                    raise gl.vm.UserError("This numeric project repository has already been approved and cannot be submitted again.")
                if attempts_by_id >= 3:
                    raise gl.vm.UserError("This numeric project repository has been rejected 3 times and is permanently locked.")

        if not isinstance(final_score, int):
            final_score = 1
        final_score = max(1, min(10, final_score))
        
        if not isinstance(allocated_gen_tokens, int):
            allocated_gen_tokens = 0
            
        if final_status != "Approved":
            allocated_gen_tokens = 0
            
        # Convert to Wei
        allocated_wei = u256(allocated_gen_tokens) * (u256(10) ** u256(18))

        # Cap at amount requested
        if allocated_wei > requested_amount_wei:
            allocated_wei = requested_amount_wei
            
        if final_status == "Approved":
            self.project_submission_attempts[project_unique_repository] = u256(999)
            if domain == "github.com":
                self.project_submitted_numeric_ids[platform_numeric_repo] = u256(999)
        else:
            current_attempts = 0
            if project_unique_repository in self.project_submission_attempts:
                current_attempts = int(self.project_submission_attempts[project_unique_repository])
            self.project_submission_attempts[project_unique_repository] = u256(current_attempts + 1)
            
            if domain == "github.com":
                num_attempts = 0
                if platform_numeric_repo in self.project_submitted_numeric_ids:
                    num_attempts = int(self.project_submitted_numeric_ids[platform_numeric_repo])
                self.project_submitted_numeric_ids[platform_numeric_repo] = u256(num_attempts + 1)

        project_id = self.next_project_id
        
        current_time = u256(int(time.time()))
        
        new_project = ProjectEvaluation(
            submitter_wallet=gl.message.sender_address,
            project_name=project_name,
            project_description=project_description,
            repository_url=repository_url,
            requested_funding_amount=requested_amount_wei,
            evaluation_status=final_status,
            evaluation_reason=final_reason,
            evaluation_score=u256(final_score),
            funds_claimed=False,
            allocated_funding_amount=allocated_wei,
            identified_strengths=json.dumps(project_strengths),
            identified_weaknesses=json.dumps(project_weaknesses),
            approval_timestamp=current_time if final_status == "Approved" else u256(0)
        )
        
        self.submitted_projects[project_id] = new_project
        self.next_project_id += u256(1)
        
        return project_id

    @gl.public.write
    def claim_allocated_funds(self, project_id: u256) -> None:
        """Allows submitters of approved projects to claim their allocated funds after the 7-day dispute window."""
        if project_id not in self.submitted_projects:
            raise gl.vm.UserError("Project not found")
            
        project = self.submitted_projects[project_id]
        
        if project.submitter_wallet != gl.message.sender_address:
            raise gl.vm.UserError("Only the original submitter can claim funds")
            
        if project.evaluation_status != "Approved":
            raise gl.vm.UserError("Project is not approved for funding")
            
        if project.funds_claimed:
            raise gl.vm.UserError("Funds have already been claimed for this project")
            
        current_time = u256(int(time.time()))
        
        # NOTE: Dispute window is currently set to 1 day (for easier testing).
        # To change the lock duration for production, adjust the multiplier below:
        # e.g., for 7 days use: 7 * 24 * 60 * 60
        dispute_window = u256(1 * 24 * 60 * 60) # 1 day in seconds
        
        if current_time < (project.approval_timestamp + dispute_window):
            raise gl.vm.UserError("The dispute window has not closed yet. Please wait.")
            
        if self.funding_treasury == u256(0):
            raise gl.vm.UserError("Funding treasury is currently empty")

        if project.allocated_funding_amount == u256(0):
            raise gl.vm.UserError("No funds were allocated to this project")
            
        if project.allocated_funding_amount > self.funding_treasury:
            raise gl.vm.UserError("Insufficient funds in the treasury. Please try again later.")
            
        payout_amount = project.allocated_funding_amount
            
        project.funds_claimed = True
        self.submitted_projects[project_id] = project
        
        self.funding_treasury -= payout_amount
        
        _Recipient(project.submitter_wallet).emit_transfer(value=payout_amount)

    @gl.public.view
    def get_treasury_balance(self) -> u256:
        return self.funding_treasury

    @gl.public.view
    def get_staked_balance(self, wallet_address: str) -> u256:
        wallet_address = wallet_address.lower()
        if wallet_address in self.staked_deposits:
            return self.staked_deposits[wallet_address]
        return u256(0)

    @gl.public.view
    def get_verified_builder_identity(self, wallet_address: str) -> str:
        wallet_address = wallet_address.lower()
        if wallet_address in self.verified_builder_identities:
            return self.verified_builder_identities[wallet_address]
        return "{}"

    @gl.public.view
    def get_project_evaluation(self, project_id: u256) -> str:
        """Returns the project evaluation details as a JSON string."""
        if project_id not in self.submitted_projects:
            raise gl.vm.UserError("Project not found.")
            
        project = self.submitted_projects[project_id]
        
        try:
            strengths_list = json.loads(project.identified_strengths)
        except Exception:
            strengths_list = []
            
        try:
            weaknesses_list = json.loads(project.identified_weaknesses)
        except Exception:
            weaknesses_list = []
            
        result_dict = {
            "id": int(project_id),
            "submitter_wallet": project.submitter_wallet.as_hex,
            "project_name": project.project_name,
            "project_description": project.project_description,
            "repository_url": project.repository_url,
            "requested_funding_amount": int(project.requested_funding_amount),
            "evaluation_status": project.evaluation_status,
            "evaluation_reason": project.evaluation_reason,
            "evaluation_score": int(project.evaluation_score),
            "funds_claimed": project.funds_claimed,
            "allocated_funding_amount": int(project.allocated_funding_amount),
            "approval_timestamp": int(project.approval_timestamp),
            "identified_strengths": strengths_list,
            "identified_weaknesses": weaknesses_list
        }
        return json.dumps(result_dict)

    @gl.public.view
    def get_all_evaluated_projects(self) -> str:
        """Returns all submitted project evaluations as a JSON string."""
        all_projects = []
        for p_id in self.submitted_projects:
            project = self.submitted_projects[p_id]
            
            try:
                strengths_list = json.loads(project.identified_strengths)
            except Exception:
                strengths_list = []
                
            try:
                weaknesses_list = json.loads(project.identified_weaknesses)
            except Exception:
                weaknesses_list = []
                
            all_projects.append({
                "id": int(p_id),
                "submitter_wallet": project.submitter_wallet.as_hex,
                "project_name": project.project_name,
                "project_description": project.project_description,
                "repository_url": project.repository_url,
                "requested_funding_amount": int(project.requested_funding_amount),
                "evaluation_status": project.evaluation_status,
                "evaluation_reason": project.evaluation_reason,
                "evaluation_score": int(project.evaluation_score),
                "funds_claimed": project.funds_claimed,
                "allocated_funding_amount": int(project.allocated_funding_amount),
                "approval_timestamp": int(project.approval_timestamp),
                "identified_strengths": strengths_list,
                "identified_weaknesses": weaknesses_list
            })
        return json.dumps(all_projects)

@gl.evm.contract_interface
class _Recipient:
    class View:
        pass
    class Write:
        pass
