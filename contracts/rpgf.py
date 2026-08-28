# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from dataclasses import dataclass
from genlayer import *


@allow_storage
@dataclass
class ProjectInfo:
    submitter: Address
    name: str
    details: str
    url: str
    amount_requested: u256
    status: str
    reason: str
    score: u256
    withdrawn: bool
    allocated_funds: u256
    strengths: str
    weaknesses: str

@gl.evm.contract_interface
class _Recipient:
    class View:
        pass
    class Write:
        pass

class RPGFContract(gl.Contract):
    # State variables for RPGF
    projects: TreeMap[u256, ProjectInfo]
    next_project_id: u256
    treasury: u256

    # State variables for Identity & Deduplication
    linked_githubs: TreeMap[str, str] # Wallet Hex -> Github Username
    linked_wallets: TreeMap[str, str] # Github Username -> Wallet Hex
    linked_github_ids: TreeMap[u256, str] # Numeric Github User ID -> Wallet Hex
    submitted_urls: TreeMap[str, u256] # Github Repo URL -> Number of Attempts (999 means Approved)
    submitted_repo_ids: TreeMap[u256, u256] # Numeric Github Repo ID -> Number of Attempts (999 means Approved)

    def __init__(self):
        self.next_project_id = u256(1)
        self.treasury = u256(0)

    @gl.public.write.payable
    def donate(self) -> None:
        """Anyone can donate GEN tokens to the treasury."""
        amount = gl.message.value
        if amount > u256(0):
            self.treasury += amount

    @gl.public.write
    def verify_and_link_github(self, profile_url: str) -> str:
        """
        Uses GenLayer AI to scan a public GitHub profile URL and verify if the caller's 
        wallet address is present in the bio. Enforces 1-to-1 identity mapping using immutable GitHub User IDs.
        """
        sender = gl.message.sender_address.as_hex.lower()
        
        if sender in self.linked_githubs:
            raise gl.vm.UserError("Your wallet is already linked to a GitHub account.")

        return self._run_github_verification(sender, profile_url, is_update=False)

    @gl.public.write
    def update_github_link(self, new_profile_url: str) -> str:
        """
        Allows a user to migrate their linked GitHub identity to a new username.
        """
        sender = gl.message.sender_address.as_hex.lower()
        
        if sender not in self.linked_githubs:
            raise gl.vm.UserError("Wallet is not linked to any GitHub account yet.")

        return self._run_github_verification(sender, new_profile_url, is_update=True)

    def _run_github_verification(self, sender: str, profile_url: str, is_update: bool) -> str:
        task = f"""
        You are a decentralized identity verifier. A user is attempting to link their GitHub account to their Web3 wallet.
        
        Your task:
        1. Scan the text/HTML content of the provided GitHub profile webpage.
        2. Look for the EXACT Ethereum wallet address: {sender}
        3. The address must be visibly present in the profile content (e.g., in bio or pinned text).
        4. Extract the user's unique username from the profile URL or content.
        5. Extract the user's numeric GitHub User ID (found in HTML meta tags or user metadata, e.g. octolytics-dimension:user_id).
        
        Return a JSON object with:
        - "verified": boolean (true if exact address is present in bio)
        - "username": string (the extracted handle, lowercase)
        - "user_id": integer (numeric GitHub user ID, or 0 if unextracted)
        - "reason": string
        """
        
        criteria = "Must return a valid JSON object with 'verified' (bool), 'username' (string), 'user_id' (int), and 'reason' (string). 'verified' MUST be true only if exact wallet address is in profile text."
        
        def fetch_data():
            try:
                content = gl.nondet.web.render(profile_url, mode='text')
            except Exception:
                content = f"Failed to fetch webpage content for {profile_url}."
            return f"Profile URL: {profile_url}\n\nWebpage Content:\n{content}"

        result = gl.eq_principle.prompt_non_comparative(fetch_data, task=task, criteria=criteria)
        
        # Parse JSON safely
        if isinstance(result, str):
            result = result.strip()
            if result.startswith("```json"): result = result[7:]
            elif result.startswith("```"): result = result[3:]
            if result.endswith("```"): result = result[:-3]
            try:
                parsed = json.loads(result.strip())
            except Exception:
                raise gl.vm.UserError("Failed to parse AI evaluation.")
        else:
            parsed = result
            
        if not isinstance(parsed, dict) or not parsed.get("verified"):
            raise gl.vm.UserError(f"Verification failed: {parsed.get('reason', 'Wallet not found in bio')}")
            
        username = parsed.get("username", "").strip().lower()
        if not username:
            raise gl.vm.UserError("Verification failed: Could not extract username.")
            
        user_id_raw = parsed.get("user_id", 0)
        user_id = u256(user_id_raw) if isinstance(user_id_raw, int) and user_id_raw > 0 else u256(0)
        
        if user_id == u256(0):
            raise gl.vm.UserError("Verification failed: Could not establish numeric GitHub User ID.")

        # Strict 1-to-1 username enforcement
        if username in self.linked_wallets and self.linked_wallets[username] != sender:
            raise gl.vm.UserError("This GitHub account is already linked to another wallet.")

        # Immutable numeric User ID deduplication check
        if user_id in self.linked_github_ids and self.linked_github_ids[user_id] != sender:
            raise gl.vm.UserError("This GitHub user ID is already linked to another wallet.")

        if is_update:
            # Free up old username
            old_username = self.linked_githubs[sender]
            if old_username in self.linked_wallets:
                del self.linked_wallets[old_username]

        # Save mappings
        self.linked_githubs[sender] = username
        self.linked_wallets[username] = sender
        if user_id > u256(0):
            self.linked_github_ids[user_id] = sender
        
        return username

    @gl.public.write
    def submit_project(self, name: str, details: str, url: str, amount_requested_gen: u256) -> u256:
        """Evaluates a project using GenLayer AI and stores the result."""
        
        sender = gl.message.sender_address.as_hex.lower()
        if sender not in self.linked_githubs:
            raise gl.vm.UserError("You must link a GitHub account before submitting.")

        # Deterministic 100 GEN Cap Enforcement
        if amount_requested_gen > u256(100):
            raise gl.vm.UserError("Maximum project request is 100 GEN.")
            
        url = url.strip().lower()
        
        # Normalize URL to prevent bypasses
        clean_url = url.replace("http://", "").replace("https://", "")
        if clean_url.endswith(".git"):
            clean_url = clean_url[:-4]
        clean_url = clean_url.rstrip("/")
        
        parts = clean_url.split("/")
        if len(parts) < 2 or parts[0] != "github.com":
            raise gl.vm.UserError("Invalid GitHub repository URL.")
            
        repo_owner = parts[1].strip()
        repo_name = parts[2].strip() if len(parts) > 2 else ""
        project_identity = f"github.com/{repo_owner}/{repo_name}"
        
        # URL Deduplication & Retry Attempt Limits (Max 3 total attempts: Initial + 2 retries)
        if project_identity in self.submitted_urls:
            attempts = int(self.submitted_urls[project_identity])
            if attempts == 999:
                raise gl.vm.UserError("This project repository has already been approved and cannot be submitted again.")
            if attempts >= 3:
                raise gl.vm.UserError("This project repository has been rejected 3 times and is permanently locked from future submissions.")

        # Check repo owner against linked user exactly
        user_handle = self.linked_githubs[sender]
        if repo_owner != user_handle:
            raise gl.vm.UserError(f"Ownership unverified: Your linked GitHub is '{user_handle}', but this repository belongs to '{repo_owner}'.")

        requested_gen = int(amount_requested_gen)
        requested_gen = max(1, min(100, requested_gen)) # Deterministic bound 1-100 GEN
        amount_requested_wei = u256(requested_gen) * (u256(10) ** u256(18))

        task = f"""
        Evaluate this project submission for Retroactive Public Goods Funding (RPGF).
        You must evaluate based on 4 criteria:
        A. Project Description & Corroboration (25%): Verify project details against actual code/content.
        B. Resource Quality (30%): Verify code functionality, commit activity, and deliverables. Reject fake or empty repos.
        C. Public Goods Impact (25%): Must provide public value (open source, education, infra).
        D. Feasibility & Execution (20%): Real work evidence.

        Special Evaluation Rules:
        1. Code-First Rule: If the submitted description is brief or simple, BUT the repository code demonstrates a solid functional public good, DO NOT reject for description length. Prioritize actual codebase quality.
        2. Mismatch Rule: If the submitted description completely mismatches the actual repository code (e.g. claims Twitter app, but repo is a calculator), set status 'Rejected', score <= 4, and allocation 0.
        3. Anti-Copycat Rule: Inspect repository creation date, commit volume, and fork markers. Reject low-effort cloned repositories lacking original contributions.
        4. Bounded Allocation: The submitter requested {requested_gen} GEN. Max allowed request is 100 GEN. If 'Approved', allocate between 1 and {requested_gen} GEN based on quality. If 'Rejected', allocation MUST be 0.

        Return JSON format:
        {{
          "score": integer (1-10),
          "status": "Approved" or "Rejected",
          "reason": "string explaining evaluation",
          "suggested_allocation": integer (0 to {requested_gen}),
          "repo_id": integer (numeric GitHub repository ID from metadata, or 0),
          "strengths": ["list of strings"],
          "weaknesses": ["list of strings"]
        }}
        """

        criteria = f"""
        Must return a valid JSON object.
        Validation Rules:
        1. 'status' MUST be 'Approved' only if web content confirms an active public goods project with real code/deliverables.
        2. 'status' MUST be 'Rejected' if repo is inaccessible, empty, placeholder, low-effort clone, or completely mismatches description.
        3. If 'status' is 'Rejected', 'suggested_allocation' MUST be 0.
        4. If 'status' is 'Approved', 'suggested_allocation' MUST be between 1 and min({requested_gen}, 100) GEN.
        5. 'reason' MUST cite verified evidence from the fetched content.
        """
        
        def fetch_data():
            try:
                content = gl.nondet.web.render(url, mode='text')
            except Exception:
                content = "Failed to fetch website content: The URL provided may be invalid or unreachable."
                
            try:
                api_content = gl.nondet.web.render(f"https://api.github.com/repos/{repo_owner}/{repo_name}", mode='text')
            except Exception:
                api_content = "Failed to fetch GitHub API data."
                
            return f"Project Name: {name}\nDetails: {details}\nSubmitter GitHub Handle: {user_handle}\nRequested Amount: {requested_gen} GEN\n\nGitHub API Repo Data:\n{api_content}\n\nWebsite Content:\n{content}"

        result = gl.eq_principle.prompt_non_comparative(
            fetch_data,
            task=task,
            criteria=criteria
        )
        
        # Robust JSON parsing
        if isinstance(result, str):
            result = result.strip()
            if result.startswith("```json"):
                result = result[7:]
            elif result.startswith("```"):
                result = result[3:]
            if result.endswith("```"):
                result = result[:-3]
            result = result.strip()
            
            try:
                result = json.loads(result)
            except Exception:
                start = result.find('{')
                end = result.rfind('}')
                if start != -1 and end != -1:
                    try:
                        result = json.loads(result[start:end+1])
                    except Exception:
                        result = {}
                else:
                    result = {}

        if not isinstance(result, dict):
            result = {}

        score_int = result.get("score", 1)
        status = result.get("status", "Rejected")
        reason = result.get("reason", "Evaluation failed.")
        allocated_gen = result.get("suggested_allocation", 0)
        repo_id_raw = result.get("repo_id", 0)
        strengths = result.get("strengths", [])
        weaknesses = result.get("weaknesses", [])

        repo_id = u256(repo_id_raw) if isinstance(repo_id_raw, int) and repo_id_raw > 0 else u256(0)

        # Enforce mandatory numeric repo ID for deduplication
        if repo_id == u256(0):
            raise gl.vm.UserError("Failed to extract numeric repository ID. This is required to prevent duplicates.")

        # Check numeric repo ID deduplication
        if repo_id in self.submitted_repo_ids:
            attempts_by_id = int(self.submitted_repo_ids[repo_id])
            if attempts_by_id == 999:
                raise gl.vm.UserError("This project repository ID has already been approved and cannot be submitted again.")
            if attempts_by_id >= 3:
                raise gl.vm.UserError("This project repository ID has been rejected 3 times and is permanently locked from future submissions.")

        if not isinstance(score_int, int):
            score_int = 1
        score_int = max(1, min(10, score_int))
        
        if not isinstance(allocated_gen, int):
            allocated_gen = 0
            
        if status != "Approved":
            allocated_gen = 0
            
        # Deterministic Python capping at min(allocated_gen, requested_gen, 100)
        allocated_gen = max(0, min(allocated_gen, requested_gen, 100))
        allocated_wei = u256(allocated_gen) * (u256(10) ** u256(18))

        # Record URL attempt state
        if status == "Approved":
            self.submitted_urls[project_identity] = u256(999)
            if repo_id > u256(0):
                self.submitted_repo_ids[repo_id] = u256(999)
        else:
            current_attempts = 0
            if project_identity in self.submitted_urls:
                current_attempts = int(self.submitted_urls[project_identity])
            self.submitted_urls[project_identity] = u256(current_attempts + 1)
            if repo_id > u256(0):
                self.submitted_repo_ids[repo_id] = u256(current_attempts + 1)
            
        project_id = self.next_project_id
        
        p = ProjectInfo(
            submitter=gl.message.sender_address,
            name=name,
            details=details,
            url=url,
            amount_requested=amount_requested_wei,
            status=status,
            reason=reason,
            score=u256(score_int),
            withdrawn=False,
            allocated_funds=allocated_wei,
            strengths=json.dumps(strengths),
            weaknesses=json.dumps(weaknesses)
        )
        
        self.projects[project_id] = p
        self.next_project_id += u256(1)
        
        return project_id

    @gl.public.write
    def claim_funds(self, project_id: u256) -> None:
        """Allows submitters of approved projects to claim their allocated funds."""
        if project_id not in self.projects:
            raise gl.vm.UserError("Project not found")
            
        p = self.projects[project_id]
        
        if p.submitter != gl.message.sender_address:
            raise gl.vm.UserError("Only the submitter can claim funds")
            
        if p.status != "Approved":
            raise gl.vm.UserError("Project is not approved for funding")
            
        if p.withdrawn:
            raise gl.vm.UserError("Funds already withdrawn for this project")
            
        if self.treasury == u256(0):
            raise gl.vm.UserError("Treasury is currently empty")

        if p.allocated_funds == u256(0):
            raise gl.vm.UserError("No funds were allocated to this project")
            
        if p.allocated_funds > self.treasury:
            raise gl.vm.UserError("Insufficient funds in the treasury. Please try again later.")
            
        final_payout = p.allocated_funds
            
        p.withdrawn = True
        self.projects[project_id] = p
        
        self.treasury -= final_payout
        
        _Recipient(p.submitter).emit_transfer(value=final_payout)

    @gl.public.view
    def get_treasury(self) -> u256:
        return self.treasury

    @gl.public.view
    def get_linked_github(self, wallet_address: str) -> str:
        wallet_address = wallet_address.lower()
        if wallet_address in self.linked_githubs:
            return self.linked_githubs[wallet_address]
        return ""

    @gl.public.view
    def get_project(self, project_id: u256) -> str:
        """Returns the project details as a JSON string."""
        if project_id not in self.projects:
            raise gl.vm.UserError("Project not found.")
            
        p = self.projects[project_id]
        
        try:
            s_list = json.loads(p.strengths)
        except Exception:
            s_list = []
            
        try:
            w_list = json.loads(p.weaknesses)
        except Exception:
            w_list = []
            
        result_dict = {
            "id": int(project_id),
            "submitter": p.submitter.as_hex,
            "name": p.name,
            "details": p.details,
            "url": p.url,
            "amount_requested": int(p.amount_requested),
            "status": p.status,
            "reason": p.reason,
            "score": int(p.score),
            "withdrawn": p.withdrawn,
            "allocated_funds": int(p.allocated_funds),
            "strengths": s_list,
            "weaknesses": w_list
        }
        return json.dumps(result_dict)

    @gl.public.view
    def get_all_projects(self) -> str:
        """Returns all submitted projects as a JSON string."""
        all_projs = []
        for pid in self.projects:
            p = self.projects[pid]
            
            try:
                s_list = json.loads(p.strengths)
            except Exception:
                s_list = []
                
            try:
                w_list = json.loads(p.weaknesses)
            except Exception:
                w_list = []
                
            all_projs.append({
                "id": int(pid),
                "submitter": p.submitter.as_hex,
                "name": p.name,
                "details": p.details,
                "url": p.url,
                "amount_requested": int(p.amount_requested),
                "status": p.status,
                "reason": p.reason,
                "score": int(p.score),
                "withdrawn": p.withdrawn,
                "allocated_funds": int(p.allocated_funds),
                "strengths": s_list,
                "weaknesses": w_list
            })
        return json.dumps(all_projs)

@gl.evm.contract_interface
class _Recipient:
    class View:
        pass
    class Write:
        pass
