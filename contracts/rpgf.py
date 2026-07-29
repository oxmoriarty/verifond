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
    allocated_funds: u256
    strengths: str
    weaknesses: str

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
        Calculate an integer `allocated_funds` between 0 and 10000 based on the score and relative quality.
        - Score 0-4: 0
        - Score 5: 25 - 100
        - Score 6: 101 - 500
        - Score 7: 501 - 1000
        - Score 8: 1001 - 2000
        - Score 9: 2001 - 5000
        - Score 10: 5001 - 10000
        """
        criteria = "Must return a valid JSON object with 'score' (int), 'status' ('Approved' or 'Rejected'), 'reason' (string), 'allocated_funds' (int), 'strengths' (list of strings), 'weaknesses' (list of strings)."
        
        def fetch_data():
            try:
                content = gl.nondet.web.render(url, mode='text')
            except Exception as e:
                content = f"Failed to fetch website content: The URL provided may be invalid or unreachable."
            return f"Project Name: {name}\nDetails: {details}\n\nWebsite Content:\n{content}"

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
        allocated = result.get("allocated_funds", 0)
        strengths = result.get("strengths", [])
        weaknesses = result.get("weaknesses", [])

        if not isinstance(score_int, int):
            score_int = 1
        score_int = max(1, min(10, score_int))
        
        if not isinstance(allocated, int):
            allocated = 0
            
        if status != "Approved":
            allocated = 0

        # Convert allocation to Wei (GEN tokens -> Wei)
        allocated_wei = u256(allocated) * (u256(10) ** u256(18))

        project_id = self.next_project_id
        
        p = Project(
            submitter=gl.message.sender_address,
            name=name,
            details=details,
            url=url,
            amount_requested=amount_requested,
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
    def get_project(self, project_id: u256) -> dict:
        if project_id not in self.projects:
            return {}
        p = self.projects[project_id]
        
        try:
            s_list = json.loads(p.strengths)
        except Exception:
            s_list = []
            
        try:
            w_list = json.loads(p.weaknesses)
        except Exception:
            w_list = []
            
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
            "withdrawn": p.withdrawn,
            "allocated_funds": int(p.allocated_funds),
            "strengths": s_list,
            "weaknesses": w_list
        }

    @gl.public.view
    def get_all_projects(self) -> list[dict]:
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
        return all_projs
