import json
import pytest

def test_submit_project(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/rpgf.py")
    direct_vm.sender = direct_alice
    
    # 1. Verify and link GitHub identity
    direct_vm.mock_web(".*github.com.*", {"status": 200, "body": "My bio contains the wallet address."})
    mock_verify_response = json.dumps({
        "verified": True, 
        "username": "testuser",
        "user_id": 123456,
        "reason": "Address found in bio"
    })
    direct_vm.mock_llm(".*decentralized identity verifier.*", mock_verify_response)
    
    username = contract.verify_and_link_github("https://github.com/testuser")
    assert username == "testuser"
    assert contract.get_linked_github("0x" + direct_alice.hex().lower()) == "testuser"

    # 2. Add some GEN to the treasury so an allocation can happen
    direct_vm.value = 1000 * 10**18
    contract.donate()

    # 3. Test 100 GEN Cap Revert
    with direct_vm.expect_revert("Maximum project request is 100 GEN."):
        contract.submit_project("Over Cap Project", "Too high", "https://github.com/testuser/project", 150)

    # 4. Submit Valid Project
    direct_vm.mock_web(".*project.*", {"status": 200, "body": "Sample open source project."})
    mock_submit_response = json.dumps({
        "score": 9,
        "status": "Approved",
        "reason": "Great public good project!",
        "suggested_allocation": 50,
        "repo_id": 987654,
        "repo_owner_id": 123456,
        "strengths": ["Open source"],
        "weaknesses": ["Small team"]
    })
    direct_vm.mock_llm(".*RPGF.*", mock_submit_response)
    
    # URL must contain the username for ownership check
    project_url = "https://github.com/testuser/project"
    
    # Amount requested is 100 GEN
    project_id = contract.submit_project("My Cool Project", "A cool project", project_url, 100)
    
    # Verify results
    assert int(project_id) == 1
    
    # Fetch project from state
    project_str = contract.get_project(project_id)
    project = json.loads(project_str)
    assert project["name"] == "My Cool Project"
    assert project["score"] == 9
    assert project["status"] == "Approved"
    assert project["allocated_funds"] > 0
    assert "Open source" in project["strengths"]

