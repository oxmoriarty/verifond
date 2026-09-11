import json
import pytest

def test_submit_project(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/rpgf.py")
    direct_vm.sender = direct_alice
    alice_hex = "0x" + direct_alice.hex().lower()
    
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
    assert contract.get_linked_github(alice_hex) == "testuser"

    # Test get_linked_identity view
    identity_str = contract.get_linked_identity(alice_hex)
    identity = json.loads(identity_str)
    assert identity["linked"] is True
    assert identity["wallet"] == alice_hex
    assert identity["handle"] == "testuser"
    assert identity["canonical_url"] == "https://github.com/testuser"
    assert identity["github_id"] == 123456

    # 2. Add some GEN to the treasury so an allocation can happen
    direct_vm.value = 1000 * 10**18
    contract.donate()
    assert int(contract.get_treasury()) == 1000 * 10**18
    assert int(contract.get_available_treasury()) == 1000 * 10**18
    assert int(contract.get_reserved_funds()) == 0

    # 3. Test 100 GEN Cap Revert
    with direct_vm.expect_revert("Maximum project request is 100 GEN."):
        contract.submit_project("Over Cap Project", "Too high", "https://github.com/testuser/project", 150)

    # 4. Submit Valid Project with Tree, History, and Contributor evaluation
    direct_vm.mock_web(".*", {"status": 200, "body": "Sample open source project repository data."})
    mock_submit_response = json.dumps({
        "score": 9,
        "status": "Approved",
        "reason": "Great public good project with verified tree, commits, and active contributors!",
        "suggested_allocation": 50,
        "repo_id": 987654,
        "repo_owner_id": 123456,
        "strengths": ["Clean tree architecture", "Sustained commit history", "Verified contributor"],
        "weaknesses": ["Small team"]
    })
    direct_vm.mock_llm(".*RPGF.*", mock_submit_response)
    
    project_url = "https://github.com/testuser/project"
    project_id = contract.submit_project("My Cool Project", "A cool project", project_url, 100)
    assert int(project_id) == 1
    
    # Verify treasury reservation upon approval
    assert int(contract.get_reserved_funds()) == 50 * 10**18
    assert int(contract.get_available_treasury()) == 950 * 10**18
    assert int(contract.get_treasury()) == 1000 * 10**18
    
    # Fetch project from state
    project_str = contract.get_project(project_id)
    project = json.loads(project_str)
    assert project["name"] == "My Cool Project"
    assert project["score"] == 9
    assert project["status"] == "Approved"
    assert project["allocated_funds"] == 50 * 10**18
    assert "Clean tree architecture" in project["strengths"]

    # 5. Claim funds and verify treasury release
    contract.claim_funds(project_id)
    assert int(contract.get_reserved_funds()) == 0
    assert int(contract.get_treasury()) == 950 * 10**18
    assert int(contract.get_available_treasury()) == 950 * 10**18

    # Re-claiming must revert
    with direct_vm.expect_revert("Funds already withdrawn for this project"):
        contract.claim_funds(project_id)


def test_identity_binding_uniqueness(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/rpgf.py")
    direct_vm.sender = direct_alice
    alice_hex = "0x" + direct_alice.hex().lower()
    bob_hex = "0x" + direct_bob.hex().lower()

    # Alice links github identity
    direct_vm.mock_web(".*", {"status": 200, "body": "Bio with wallet"})
    mock_alice_verify = json.dumps({
        "verified": True,
        "username": "dev_alice",
        "user_id": 998877,
        "reason": "Bio verified"
    })
    direct_vm.mock_llm(".*dev_alice.*", mock_alice_verify)
    contract.verify_and_link_github("https://github.com/dev_alice")

    # Bob attempts to link same username/handle
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("This GitHub account is already linked to another wallet."):
        contract.verify_and_link_github("https://github.com/dev_alice")

    # Bob attempts to link same user_id with different handle dev_bob
    mock_bob_uid_conflict = json.dumps({
        "verified": True,
        "username": "dev_bob",
        "user_id": 998877,
        "reason": "Duplicate numeric ID attempt"
    })
    direct_vm.mock_llm(".*dev_bob.*", mock_bob_uid_conflict)
    with direct_vm.expect_revert("This GitHub user ID is already linked to another wallet."):
        contract.verify_and_link_github("https://github.com/dev_bob")


def test_treasury_solvency_reservation_cap(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/rpgf.py")
    direct_vm.sender = direct_alice

    # Setup identity
    direct_vm.mock_web(".*", {"status": 200, "body": "Web data"})
    mock_verify = json.dumps({
        "verified": True,
        "username": "grantee",
        "user_id": 55555,
        "reason": "Valid"
    })
    direct_vm.mock_llm(".*decentralized identity verifier.*", mock_verify)
    contract.verify_and_link_github("https://github.com/grantee")

    # Donate 60 GEN
    direct_vm.value = 60 * 10**18
    contract.donate()
    assert int(contract.get_treasury()) == 60 * 10**18
    assert int(contract.get_available_treasury()) == 60 * 10**18

    # Project 1 requests 40 GEN, approved for 40 GEN
    direct_vm.clear_mocks()
    direct_vm.mock_web(".*", {"status": 200, "body": "Web data"})
    mock_proj1 = json.dumps({
        "score": 8,
        "status": "Approved",
        "reason": "Good project",
        "suggested_allocation": 40,
        "repo_id": 1001,
        "repo_owner_id": 55555,
        "strengths": ["Solid repo tree"],
        "weaknesses": []
    })
    direct_vm.mock_llm(".*RPGF.*", mock_proj1)
    contract.submit_project("Project Alpha", "Alpha details", "https://github.com/grantee/alpha", 40)

    # 40 GEN reserved, 20 GEN available
    assert int(contract.get_reserved_funds()) == 40 * 10**18
    assert int(contract.get_available_treasury()) == 20 * 10**18

    # Clear prior mocks and set up project 2 mock
    direct_vm.clear_mocks()
    direct_vm.mock_web(".*", {"status": 200, "body": "Web data"})
    mock_proj2 = json.dumps({
        "score": 8,
        "status": "Approved",
        "reason": "Good project",
        "suggested_allocation": 50,
        "repo_id": 1002,
        "repo_owner_id": 55555,
        "strengths": ["Solid repo tree"],
        "weaknesses": []
    })
    direct_vm.mock_llm(".*RPGF.*", mock_proj2)
    contract.submit_project("Project Beta", "Beta details", "https://github.com/grantee/beta", 50)

    # Now total reserved must equal full treasury (60 GEN), available = 0
    assert int(contract.get_reserved_funds()) == 60 * 10**18
    assert int(contract.get_available_treasury()) == 0

    p2 = json.loads(contract.get_project(2))
    assert p2["allocated_funds"] == 20 * 10**18


def test_fork_and_tree_rejection(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/rpgf.py")
    direct_vm.sender = direct_alice

    # Setup identity
    direct_vm.mock_web(".*", {"status": 200, "body": "Web data"})
    mock_verify = json.dumps({
        "verified": True,
        "username": "copier",
        "user_id": 44444,
        "reason": "Valid"
    })
    direct_vm.mock_llm(".*decentralized identity verifier.*", mock_verify)
    contract.verify_and_link_github("https://github.com/copier")

    # Donate treasury
    direct_vm.value = 100 * 10**18
    contract.donate()

    # Evaluator detects unmodified fork and empty tree
    direct_vm.clear_mocks()
    direct_vm.mock_web(".*", {"status": 200, "body": "Web data with fork flag"})
    mock_reject = json.dumps({
        "score": 2,
        "status": "Rejected",
        "reason": "Repository is an unoriginal fork with empty tree and single commit.",
        "suggested_allocation": 0,
        "repo_id": 9901,
        "repo_owner_id": 44444,
        "strengths": [],
        "weaknesses": ["Unmodified fork", "Empty source tree", "No original commit history"]
    })
    direct_vm.mock_llm(".*RPGF.*", mock_reject)
    project_id = contract.submit_project("Fork Clone", "Copied", "https://github.com/copier/forked-repo", 50)

    # Verify project stored as Rejected, no funds reserved
    p = json.loads(contract.get_project(project_id))
    assert p["status"] == "Rejected"
    assert p["allocated_funds"] == 0
    assert int(contract.get_reserved_funds()) == 0
    assert int(contract.get_available_treasury()) == 100 * 10**18
    assert "Unmodified fork" in p["weaknesses"]

