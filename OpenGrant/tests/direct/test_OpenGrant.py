import pytest
import json

def test_project_evaluation_without_treasury(direct_vm, direct_deploy, direct_alice):
    """
    Test the AI-powered project evaluation flow.
    Ensures that an approved project locks in an allocation even if the treasury is 0.
    """
    contract = direct_deploy("OpenGrant/contracts/OpenGrant.py")
    direct_vm.sender = direct_alice
    
    # 1. Setup mock web response for identity verification
    alice_hex = "0x" + direct_alice.hex()
    direct_vm.mock_web(r".*", "Bio: " + alice_hex)
    
    mock_id_llm = {
        "is_verified": True,
        "extracted_username": "testuser",
        "failure_reason": ""
    }
    direct_vm.mock_llm(r".*", json.dumps(mock_id_llm))
    
    # Verify Identity
    contract.verify_builder_identity("https://github.com/testuser")
    
    # 2. Mock web response for the project repo
    direct_vm.mock_web(r".*", "Codebase goes here")
    
    # 3. Mock LLM evaluation response
    mock_llm_response = {
        "evaluation_score": 8,
        "evaluation_status": "Approved",
        "evaluation_reason": "Great project",
        "suggested_funding_allocation": 50,
        "identified_strengths": ["Good code"],
        "identified_weaknesses": ["None"]
    }
    direct_vm.mock_llm(r".*", json.dumps(mock_llm_response))
    
    # 4. Call evaluate_and_submit_project with 50 GEN input
    project_id = contract.evaluate_and_submit_project(
        "My Project", 
        "Description", 
        "https://github.com/testuser/repo", 
        50
    )
    
    # Assert that status changes to "Approved" and allocation is saved
    evaluation_json = contract.get_project_evaluation(project_id)
    evaluation = json.loads(evaluation_json)
    
    assert evaluation["evaluation_status"] == "Approved"
    assert evaluation["allocated_funding_amount"] == 50 * 10**18
    assert contract.get_treasury_balance() == 0 # Treasury still empty!

def test_staked_ai_jury_and_timelock(direct_vm, direct_deploy, direct_alice, direct_bob):
    """
    Test the dispute system, upfront penalty deduction, and AI slashing.
    """
    contract = direct_deploy("OpenGrant/contracts/OpenGrant.py")
    
    # Alice submits a project
    direct_vm.sender = direct_alice
    alice_hex = "0x" + direct_alice.hex()
    direct_vm.mock_web(r".*", "Bio: " + alice_hex)
    
    mock_id_llm = {
        "is_verified": True,
        "extracted_username": "testuser",
        "failure_reason": ""
    }
    direct_vm.mock_llm(r".*", json.dumps(mock_id_llm))
    
    contract.verify_builder_identity("https://github.com/testuser")
    direct_vm.mock_web(r".*", "Codebase goes here")
    mock_eval = {
        "evaluation_score": 8,
        "evaluation_status": "Approved",
        "evaluation_reason": "Great project",
        "suggested_funding_allocation": 50,
        "identified_strengths": [],
        "identified_weaknesses": []
    }
    direct_vm.mock_llm(r".*", json.dumps(mock_eval))
    project_id = contract.evaluate_and_submit_project("Proj", "Desc", "https://github.com/testuser/repo", 50)
    
    # Bob stakes for jury
    direct_vm.sender = direct_bob
    # Fund the contract with 15 GEN
    direct_vm.value = 15 * 10**18
    contract.stake_for_jury()
    bob_hex = "0x" + direct_bob.hex()
    assert contract.get_staked_balance(bob_hex) == 15 * 10**18
    
    # Bob disputes
    mock_dispute = {
        "is_valid_dispute": True,
        "judge_reasoning": "Plagiarism found."
    }
    direct_vm.mock_llm(r".*", json.dumps(mock_dispute))
    
    contract.dispute_project(project_id, "This is copied from somewhere else.")
    
    # Bob should get 2 GEN refunded + 5 GEN bounty = 20 GEN total
    assert contract.get_staked_balance(bob_hex) == 20 * 10**18
    
    # Project should be slashed
    evaluation_json = contract.get_project_evaluation(project_id)
    evaluation = json.loads(evaluation_json)
    assert evaluation["evaluation_status"] == "Rejected"
    assert evaluation["allocated_funding_amount"] == 0
    
    # Treasury should have the remaining 45 GEN
    assert contract.get_treasury_balance() == 45 * 10**18
