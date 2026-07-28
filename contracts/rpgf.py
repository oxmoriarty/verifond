# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from dataclasses import dataclass
from genlayer import *

@gl.evm.contract_interface
class _Recipient:
    class View:
        pass
    class Write:
        pass

@allow_storage
@dataclass
class Project:
    submitter: Address
    name: str
    details: str
    url: str
    amount_requested: u256
    status: str
    reason: str
    score: u256
    withdrawn: bool

class RPGF(gl.Contract):
    projects: TreeMap[u256, Project]
    next_project_id: u256
    treasury: u256

    def __init__(self):
        self.projects = TreeMap()
        self.next_project_id = u256(1)
        self.treasury = u256(0)

    @gl.public.write.payable
    def donate(self) -> None:
        """Anyone can donate GEN tokens to the treasury."""
        amount = gl.message.value
        if amount > u256(0):
            self.treasury += amount

    @gl.public.write
    def submit_project(self, name: str, details: str, url: str, amount_requested: u256) -> u256:
        """Evaluates a project using GenLayer AI and stores the result."""
        task = """
        Evaluate this project based on its contribution to public goods.
        Valuable Public Goods include open-source software, free educational resources, community infrastructure, or public research.
        Purely profit-driven, closed-source SaaS products should be penalized.
        Score from 1 to 10.
        If score is 5 to 10, set status to 'Approved'. If 1 to 4, set status to 'Rejected'.
        Provide a brief 'reason' explaining the decision.
        """
        criteria = "Must return a valid JSON object with 'score' (integer), 'status' (string 'Approved' or 'Rejected'), and 'reason' (string)."
        
        def fetch_data():
            content = gl.nondet.web.render(url, mode='text')
            return f"Project Name: {name}\nDetails: {details}\n\nWebsite Content:\n{content}"

        result = gl.eq_principle.prompt_non_comparative(
            fetch_data,
            task=task,
            criteria=criteria,
            response_format='json'
        )
        
        # Ensure result is a dict (JSON response)
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except Exception:
                result = {"score": 1, "status": "Rejected", "reason": "Failed to parse AI evaluation"}

        score_int = result.get("score", 1)
        status = result.get("status", "Rejected")
        reason = result.get("reason", "Evaluation failed.")

        # Cap score between 1 and 10
        if not isinstance(score_int, int):
            score_int = 1
        score_int = max(1, min(10, score_int))

        # Store project
        project_id = self.next_project_id
        
        p = Project(
            submitter=gl.message.sender_account,
            name=name,
            details=details,
            url=url,
            amount_requested=amount_requested,
            status=status,
            reason=reason,
            score=u256(score_int),
            withdrawn=False
        )
        
        self.projects[project_id] = p
        self.next_project_id += u256(1)
        
        return project_id

    @gl.public.write
    def claim_funds(self, project_id: u256) -> None:
        """Allows submitters of approved projects to claim their dynamically calculated allocation."""
        if project_id not in self.projects:
            raise gl.vm.UserError("Project not found")
            
        p = self.projects[project_id]
        
        if p.submitter != gl.message.sender_account:
            raise gl.vm.UserError("Only the submitter can claim funds")
            
        if p.status != "Approved":
            raise gl.vm.UserError("Project is not approved for funding")
            
        if p.withdrawn:
            raise gl.vm.UserError("Funds already withdrawn for this project")
            
        if self.treasury == u256(0):
            raise gl.vm.UserError("Treasury is currently empty")

        # Dynamic Allocation Math:
        score_multiplier = p.score * u256(10)  # 10 to 100
        ideal_payout = (p.amount_requested * score_multiplier) // u256(100)
        
        max_payout = (self.treasury * u256(5)) // u256(100)  # 5% of treasury
        
        final_payout = ideal_payout if ideal_payout < max_payout else max_payout
        
        if final_payout == u256(0):
            raise gl.vm.UserError("Calculated payout is 0")
            
        p.withdrawn = True
        self.projects[project_id] = p
        
        self.treasury -= final_payout
        
        # Send funds to submitter using _Recipient.emit_transfer
        _Recipient(p.submitter).emit_transfer(value=final_payout)

    @gl.public.view
    def get_treasury(self) -> u256:
        return self.treasury

    @gl.public.view
    def get_project(self, project_id: u256) -> dict:
        if project_id not in self.projects:
            return {}
        p = self.projects[project_id]
        return {
            "id": int(project_id),
            "submitter": p.submitter.as_hex,
            "name": p.name,
            "details": p.details,
            "url": p.url,
            "amount_requested": int(p.amount_requested),
            "status": p.status,
            "reason": p.reason,
            "score": int(p.score),
            "withdrawn": p.withdrawn
        }

    @gl.public.view
    def get_all_projects(self) -> list[dict]:
        all_projs = []
        for pid in self.projects:
            p = self.projects[pid]
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
                "withdrawn": p.withdrawn
            })
        return all_projs
