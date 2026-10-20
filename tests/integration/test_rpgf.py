import json
import pytest
from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded

@pytest.mark.integration
def test_rpgf_integration():
    # Deploy the RPGF contract
    factory = get_contract_factory("RPGF")
    contract = factory.deploy()
    
    # Assert initial treasury state
    treasury_details_str = contract.get_treasury_details(args=[]).call()
    assert treasury_details_str is not None
    treasury_details = json.loads(treasury_details_str)
    assert treasury_details.get("total_treasury") == 0
    assert treasury_details.get("total_reserved") == 0
    assert treasury_details.get("available_treasury") == 0

    # Assert initial projects list is empty
    projects_str = contract.get_all_projects(args=[]).call()
    assert projects_str == "[]"

    # Assert unlinked identity returns linked=False
    identity_str = contract.get_linked_identity(args=["0x0000000000000000000000000000000000000000"]).call()
    assert identity_str is not None
    identity = json.loads(identity_str)
    assert identity.get("linked") is False
