import pytest

def test_deploy(direct_deploy):
    contract = direct_deploy("contracts/rpgf.py")
    assert contract is not None
