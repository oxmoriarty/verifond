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
    total_reserved: u256

    # State variables for Identity & Deduplication
    linked_githubs: TreeMap[str, str] # Wallet Hex -> Github Username
    linked_wallets: TreeMap[str, str] # Github Username -> Wallet Hex
    linked_github_ids: TreeMap[u256, str] # Numeric Github User ID -> Wallet Hex
    linked_user_ids: TreeMap[str, u256] # Wallet Hex -> Numeric Github User ID
    linked_profile_urls: TreeMap[str, str] # Canonical GitHub Profile URL -> Wallet Hex
    linked_canonical_urls: TreeMap[str, str] # Wallet Hex -> Canonical GitHub Profile URL
    submitted_urls: TreeMap[str, u256] # Github Repo URL -> Number of Attempts (999 means Approved)
    submitted_repo_ids: TreeMap[u256, u256] # Numeric Github Repo ID -> Number of Attempts (999 means Approved)

    def __init__(self):
        self.next_project_id = u256(1)
        self.treasury = u256(0)
        self.total_reserved = u256(0)

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
                
            try:
                # Extract username from URL to hit the API
                clean_url = profile_url.replace("http://", "").replace("https://", "").rstrip("/")
                parts = clean_url.split("/")
                api_username = parts[-1] if len(parts) > 1 else ""
                api_content = gl.nondet.web.render(f"https://api.github.com/users/{api_username}", mode='text') if api_username else "No username found."
            except Exception:
                api_content = "Failed to fetch GitHub API data."
                
            return f"Profile URL: {profile_url}\n\nGitHub API User Data:\n{api_content}\n\nWebpage Content:\n{content}"

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

        # Form canonical profile URL
        canonical_url = f"https://github.com/{username}"

        # Strict 1-to-1 username / handle enforcement
        if username in self.linked_wallets and self.linked_wallets[username] != sender:
            raise gl.vm.UserError("This GitHub account is already linked to another wallet.")

        # Immutable numeric User ID deduplication check
        if user_id in self.linked_github_ids and self.linked_github_ids[user_id] != sender:
            raise gl.vm.UserError("This GitHub user ID is already linked to another wallet.")

        # Canonical URL deduplication check
        if canonical_url in self.linked_profile_urls and self.linked_profile_urls[canonical_url] != sender:
            raise gl.vm.UserError("This canonical GitHub profile URL is already linked to another wallet.")

        if is_update:
            # Free up old bindings
            if sender in self.linked_githubs:
                old_username = self.linked_githubs[sender]
                if old_username in self.linked_wallets:
                    del self.linked_wallets[old_username]
            if sender in self.linked_user_ids:
                old_uid = self.linked_user_ids[sender]
                if old_uid in self.linked_github_ids:
                    del self.linked_github_ids[old_uid]
            if sender in self.linked_canonical_urls:
                old_curl = self.linked_canonical_urls[sender]
                if old_curl in self.linked_profile_urls:
                    del self.linked_profile_urls[old_curl]

        # Bind wallet proof, canonical GitHub URL, API handle, and immutable GitHub user ID to one account
        self.linked_githubs[sender] = username
        self.linked_wallets[username] = sender
        self.linked_github_ids[user_id] = sender
        self.linked_user_ids[sender] = user_id
        self.linked_profile_urls[canonical_url] = sender
        self.linked_canonical_urls[sender] = canonical_url
        
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
        You are provided with 5 verified sources of repository evidence:
        1. Repository Metadata & Fork Data (API: /repos/{repo_owner}/{repo_name})
        2. Pinned Repository Tree Structure (API: /repos/{repo_owner}/{repo_name}/contents)
        3. Commit History (API: /repos/{repo_owner}/{repo_name}/commits)
        4. Contributor Records (API: /repos/{repo_owner}/{repo_name}/contributors)
        5. Public Webpage Content ({url})

        Evaluation Criteria (Weighted 100%):
        A. Repository Tree & Architecture (25%): Verify pinned directory tree structure, actual source code files, architecture, and functional deliverables. Reject empty, skeleton, or placeholder repositories.
        B. Commit History & Work Authenticity (25%): Verify commit history, timestamps, and sustained development progression. Reject repositories with only a single synthetic commit or bulk copy-paste dump.
        C. Contributor & Provenance Verification (25%): Verify that the submitter ({user_handle}) is an active contributor with meaningful commits. Inspect fork data: if 'fork' is true, verify substantial original modifications and novel value beyond upstream parent; reject unmodified or trivial forks.
        D. Public Goods Impact & Feasibility (25%): Assess whether the project provides genuine public value (open-source utility, tooling, educational, or ecosystem infrastructure).

        Special Evaluation Rules:
        1. Fork & Clone Rule: If the repository is a fork or low-effort clone lacking substantial original work by {user_handle}, set status 'Rejected', score <= 3, and suggested_allocation = 0.
        2. Tree & File Check: If the repository tree contains only placeholder files (e.g., only README.md or license without real functional code), set status 'Rejected', score <= 2, and suggested_allocation = 0.
        3. Commit History Check: If commit history does not demonstrate authentic work by the submitter or shows anomalous history, penalize heavily or Reject.
        4. Code-First Rule: If the submitted description is brief or simple, BUT the repository code demonstrates a solid functional public good, DO NOT reject for description length. Prioritize actual codebase quality.
        5. Mismatch Rule: If the submitted description completely mismatches the actual repository code (e.g. claims Twitter app, but repo is a calculator), set status 'Rejected', score <= 4, and suggested_allocation = 0.
        6. Bounded Allocation: The submitter requested {requested_gen} GEN. Max allowed request is 100 GEN. If 'Approved', allocate between 1 and {requested_gen} GEN based on quality and impact. If 'Rejected', suggested_allocation MUST be 0.

        Return JSON format:
        {{
          "score": integer (1-10),
          "status": "Approved" or "Rejected",
          "reason": "detailed string explaining evaluation citing tree structure, commit history, contributor records, and fork status",
          "suggested_allocation": integer (0 to {requested_gen}),
          "repo_id": integer (numeric GitHub repository ID from metadata, or 0),
          "repo_owner_id": integer (numeric GitHub user ID of the repository owner from API data, or 0),
          "strengths": ["list of strings"],
          "weaknesses": ["list of strings"]
        }}
        """

        criteria = f"""
        Must return a valid JSON object.
        Validation Rules:
        1. 'status' MUST be 'Approved' only if the repository tree contains substantive source code, commit history proves sustained effort, contributors include the author, and fork data shows original work.
        2. 'status' MUST be 'Rejected' if repo is inaccessible, empty tree, single-commit clone, low-effort fork, or completely mismatches description.
        3. If 'status' is 'Rejected', 'suggested_allocation' MUST be 0.
        4. If 'status' is 'Approved', 'suggested_allocation' MUST be between 1 and min({requested_gen}, 100) GEN.
        5. 'reason' MUST cite specific evidence from repository tree, commit history, contributors, and fork status.
        """
        
        def fetch_data():
            try:
                content = gl.nondet.web.render(url, mode='text')
            except Exception:
                content = "Failed to fetch website content: The URL provided may be invalid or unreachable."
                
            try:
                api_repo = gl.nondet.web.render(f"https://api.github.com/repos/{repo_owner}/{repo_name}", mode='text')
            except Exception:
                api_repo = "Failed to fetch GitHub API repository metadata."

            try:
                api_tree = gl.nondet.web.render(f"https://api.github.com/repos/{repo_owner}/{repo_name}/contents", mode='text')
            except Exception:
                api_tree = "Failed to fetch GitHub repository tree contents."

            try:
                api_commits = gl.nondet.web.render(f"https://api.github.com/repos/{repo_owner}/{repo_name}/commits?per_page=10", mode='text')
            except Exception:
                api_commits = "Failed to fetch GitHub commit history."

            try:
                api_contributors = gl.nondet.web.render(f"https://api.github.com/repos/{repo_owner}/{repo_name}/contributors?per_page=10", mode='text')
            except Exception:
                api_contributors = "Failed to fetch GitHub contributors."
                
            return (
                f"Project Name: {name}\n"
                f"Details: {details}\n"
                f"Submitter GitHub Handle: {user_handle}\n"
                f"Requested Amount: {requested_gen} GEN\n\n"
                f"--- GitHub API Repo & Fork Data ---\n{api_repo}\n\n"
                f"--- Repository Pinned Tree Contents ---\n{api_tree}\n\n"
                f"--- Repository Commit History ---\n{api_commits}\n\n"
                f"--- Repository Contributors ---\n{api_contributors}\n\n"
                f"--- Public Webpage Content ---\n{content}"
            )

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
        repo_owner_id_raw = result.get("repo_owner_id", 0)
        strengths = result.get("strengths", [])
        weaknesses = result.get("weaknesses", [])

        repo_id = u256(repo_id_raw) if isinstance(repo_id_raw, int) and repo_id_raw > 0 else u256(0)
        repo_owner_id = u256(repo_owner_id_raw) if isinstance(repo_owner_id_raw, int) and repo_owner_id_raw > 0 else u256(0)

        # Enforce mandatory numeric repo ID for deduplication
        if repo_id == u256(0):
            raise gl.vm.UserError("Failed to extract numeric repository ID. This is required to prevent duplicates.")
            
        # Enforce strict numeric User ID ownership matching
        if repo_owner_id == u256(0):
            raise gl.vm.UserError("Failed to extract numeric repository owner ID.")
            
        if repo_owner_id not in self.linked_github_ids or self.linked_github_ids[repo_owner_id] != sender:
            raise gl.vm.UserError("Ownership unverified: The numeric User ID of this repository's owner does not match your linked identity.")

        # Check numeric repo ID deduplication
        if repo_id in self.submitted_repo_ids:
            attempts_by_id = int(self.submitted_repo_ids[repo_id])
            if attempts_by_id == 999:
                raise gl.vm.UserError("This project repository ID has already been approved and cannot be submitted again.")
            if attempts_by_id >= 3:
                raise gl.vm.UserError("This project repository ID has been rejected 3 times and is permanently locked from future submissions.")

        # Available unreserved treasury calculation
        available_treasury = self.treasury - self.total_reserved if self.treasury >= self.total_reserved else u256(0)
        available_gen = int(available_treasury // (u256(10) ** u256(18)))

        if not isinstance(score_int, int):
            score_int = 1
        score_int = max(1, min(10, score_int))
        
        if not isinstance(allocated_gen, int):
            allocated_gen = 0
            
        if status != "Approved":
            allocated_gen = 0
            
        # Deterministic Python capping at min(allocated_gen, requested_gen, 100, available_gen)
        # Reserve approved allocations against unreserved treasury funds
        allocated_gen = max(0, min(allocated_gen, requested_gen, 100, available_gen))
        allocated_wei = u256(allocated_gen) * (u256(10) ** u256(18))

        # Reserve allocated funds against treasury immediately upon approval
        if status == "Approved" and allocated_wei > u256(0):
            self.total_reserved += allocated_wei

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

        if p.allocated_funds > self.total_reserved:
            raise gl.vm.UserError("Reserved allocation mismatch in treasury.")
            
        final_payout = p.allocated_funds
            
        p.withdrawn = True
        self.projects[project_id] = p
        
        # Deduct from both total_reserved and treasury
        self.total_reserved -= final_payout
        self.treasury -= final_payout
        
        _Recipient(p.submitter).emit_transfer(value=final_payout)

    @gl.public.view
    def get_treasury(self) -> u256:
        return self.treasury

    @gl.public.view
    def get_reserved_funds(self) -> u256:
        return self.total_reserved

    @gl.public.view
    def get_available_treasury(self) -> u256:
        if self.treasury >= self.total_reserved:
            return self.treasury - self.total_reserved
        return u256(0)

    @gl.public.view
    def get_treasury_details(self) -> str:
        avail = self.treasury - self.total_reserved if self.treasury >= self.total_reserved else u256(0)
        return json.dumps({
            "total_treasury": int(self.treasury),
            "total_reserved": int(self.total_reserved),
            "available_treasury": int(avail)
        })

    @gl.public.view
    def get_linked_github(self, wallet_address: str) -> str:
        wallet_address = wallet_address.lower()
        if wallet_address in self.linked_githubs:
            return self.linked_githubs[wallet_address]
        return ""

    @gl.public.view
    def get_linked_identity(self, wallet_address: str) -> str:
        """Returns the complete bound identity bundle for a wallet address."""
        wallet_address = wallet_address.lower()
        if wallet_address not in self.linked_githubs:
            return json.dumps({"linked": False})
        handle = self.linked_githubs[wallet_address]
        user_id = int(self.linked_user_ids[wallet_address]) if wallet_address in self.linked_user_ids else 0
        canonical_url = self.linked_canonical_urls[wallet_address] if wallet_address in self.linked_canonical_urls else f"https://github.com/{handle}"
        return json.dumps({
            "linked": True,
            "wallet": wallet_address,
            "handle": handle,
            "canonical_url": canonical_url,
            "github_id": user_id
        })

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
