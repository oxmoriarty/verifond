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

class RPGFContract(gl.Contract):
    # State variables for RPGF
    projects: TreeMap[u256, ProjectInfo]
    next_project_id: u256
    treasury: u256

    # State variables for Identity & Deduplication
    linked_githubs: TreeMap[str, str] # Wallet Hex -> Github Username
    linked_wallets: TreeMap[str, str] # Github Username -> Wallet Hex
    submitted_urls: TreeMap[str, u256] # Github Repo URL -> Number of Attempts (999 means Approved)

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
        wallet address is present in the bio. Enforces 1-to-1 identity mapping.
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
        You are a decentralized identity verifier. A user is attempting to link their github account to their Web3 wallet.
        
        Your task:
        1. Scan the text content of the provided profile webpage.
        2. Look for the EXACT Ethereum wallet address: {sender}
        3. The address must be visibly present in the content (e.g., in their bio or pinned text).
        4. Extract the user's unique username from the profile URL (e.g., from 'https://github.com/oxmoriarty' extract 'oxmoriarty').
        
        Return a JSON object with:
        - "verified": boolean (true if the exact address is found)
        - "username": string (the extracted username, or empty string if failed)
        - "reason": string
        """
        
        criteria = "Must return a valid JSON object with 'verified' (bool), 'username' (string), and 'reason' (string)."
        
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
            
        # 1-to-1 strict enforcement
        if username in self.linked_wallets and self.linked_wallets[username] != sender:
            raise gl.vm.UserError("This GitHub account is already linked to another wallet.")

        if is_update:
            # Free up the old username
            old_username = self.linked_githubs[sender]
            if old_username in self.linked_wallets:
                del self.linked_wallets[old_username]

        # Save the two-way mapping
        self.linked_githubs[sender] = username
        self.linked_wallets[username] = sender
        
        return username

    @gl.public.write
    def submit_project(self, name: str, details: str, url: str, amount_requested_gen: u256) -> u256:
        """Evaluates a project using GenLayer AI and stores the result."""
        
        sender = gl.message.sender_address.as_hex.lower()
        if sender not in self.linked_githubs:
            raise gl.vm.UserError("You must link a GitHub account before submitting.")
            
        url = url.strip().lower()
        
        # Normalize URL to prevent bypasses (http vs https, trailing slashes, .git)
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
        
        if project_identity in self.submitted_urls:
            attempts = int(self.submitted_urls[project_identity])
            if attempts == 999:
                raise gl.vm.UserError("This project repository has already been approved and cannot be submitted again.")
            if attempts >= 3:
                raise gl.vm.UserError("This project repository has been rejected 3 times and is permanently locked from future submissions.")
        if repo_owner != self.linked_githubs[sender]:
            raise gl.vm.UserError(f"Ownership unverified. You are linked to '{self.linked_githubs[sender]}', but this repo belongs to '{repo_owner}'.")
            
        requested_gen = int(amount_requested_gen)
        amount_requested_wei = u256(requested_gen) * (u256(10) ** u256(18))

        task = f"""
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
        The submitter has requested a total of {requested_gen} GEN tokens.
        Calculate 'suggested_allocation' (an integer representing the exact number of GEN tokens to award).
        - If 'Rejected', this MUST be 0.
        - If 'Approved', you should allocate an amount up to {requested_gen} GEN depending on the project's verified quality and impact. Do NOT exceed the requested amount.
        
        Corroboration:
        Carefully compare the submitted 'Details' against the actual 'Website Content'. If the website content does not corroborate the claims made in Details (e.g., exaggerated features or empty repo), heavily penalize the score and allocation.
        """
        criteria = "Must return a valid JSON object with 'score' (int), 'status' ('Approved' or 'Rejected'), 'reason' (string), 'suggested_allocation' (int), 'strengths' (list of strings), 'weaknesses' (list of strings)."
        
        def fetch_data():
            try:
                content = gl.nondet.web.render(url, mode='text')
            except Exception as e:
                content = f"Failed to fetch website content: The URL provided may be invalid or unreachable."
            return f"Project Name: {name}\nDetails: {details}\nRequested Amount: {requested_gen} GEN\n\nWebsite Content:\n{content}"

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
                # Fallback: extract substring between first { and last }
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
        strengths = result.get("strengths", [])
        weaknesses = result.get("weaknesses", [])

        if not isinstance(score_int, int):
            score_int = 1
        score_int = max(1, min(10, score_int))
        
        if not isinstance(allocated_gen, int):
            allocated_gen = 0
            
        if status != "Approved":
            allocated_gen = 0
            
        # Convert to Wei
        allocated_wei = u256(allocated_gen) * (u256(10) ** u256(18))

        # Cap at amount requested
        if allocated_wei > amount_requested_wei:
            allocated_wei = amount_requested_wei
            
        if status == "Approved":
            self.submitted_urls[project_identity] = u256(999)
        else:
            current_attempts = 0
            if project_identity in self.submitted_urls:
                current_attempts = int(self.submitted_urls[project_identity])
            self.submitted_urls[project_identity] = u256(current_attempts + 1)
            
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
