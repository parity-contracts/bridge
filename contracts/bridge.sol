// Copyright 2017-2018 Parity Technologies (UK) Ltd.
// This file is part of Parity-Bridge.

// Parity-Bridge is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// Parity-Bridge is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with Parity-Bridge.  If not, see <http://www.gnu.org/licenses/>.
//
// https://github.com/parity-contracts/bridge

pragma solidity ^0.4.24;

/// General helpers.
/// `internal` so they get compiled into contracts using them.
library Helpers {
    /// returns whether `array` contains `value`.
    function addressArrayContains(address[] array, address value) internal pure returns (bool) {
        for (uint256 i = 0; i < array.length; i++) {
            if (array[i] == value) {
                return true;
            }
        }
        return false;
    }
}

/// Library used only to test Helpers library via rpc calls
library HelpersTest {
    function addressArrayContains(address[] array, address value) public pure returns (bool) {
        return Helpers.addressArrayContains(array, value);
    }
}

contract ExecuteTest {
    bytes public lastData;

    function () public {
        lastData = msg.data;
    }
}

/// Part of the bridge that needs to be deployed on the main chain.
contract Main {
    /// Number of authorities signatures required to relay the message.
    /// Must be less than a number of authorities.
    uint256 public requiredSignatures;
    /// List of authorities.
    address[] public authorities;
    /// Messages that need to be relayed
    mapping (bytes32 => bytes) public messages;

    /// Event created when new message needs to be passed to the side chain.
    event RelayMessage(bytes32 messageID, address sender, address recipient);

    constructor (
        uint256 requiredSignaturesParam,
        address[] authoritiesParam
    ) public {
        require(requiredSignaturesParam != 0);
        require(requiredSignaturesParam <= authoritiesParam.length);
        requiredSignatures = requiredSignaturesParam;
        authorities = authoritiesParam;
    }

    /// Call this function to relay this message to the side chain.
    function relayMessage(bytes data, address recipient) public {
        bytes32 messageID = keccak256(data);
        messages[messageID] = data;
        emit RelayMessage(messageID, msg.sender, recipient);
    }
}


/// Part of the bridge that needs to be deployed on the side chain.
contract Side {
    /// Number of authorities signatures required to relay the message.
    /// Must be less than a number of authorities.
    uint256 public requiredSignatures;
    /// List of authorities.
    address[] public authorities;
    /// Messages that are being accepted mapped to authorities addresses, who
    /// already confirmed them.
    mapping (bytes32 => address[]) public messages;
    /// Main chain addresses mapped to their side chain identities.
    mapping (address => address) public ids;

    event AcceptedMessage(bytes32 messageID, address sender, address recipient);

    constructor (
        uint256 requiredSignaturesParam,
        address[] authoritiesParam
    ) public {
        require(requiredSignaturesParam != 0);
        require(requiredSignaturesParam <= authoritiesParam.length);
        requiredSignatures = requiredSignaturesParam;
        authorities = authoritiesParam;
    }

    /// Require sender to be an authority.
    modifier onlyAuthority() {
        require(Helpers.addressArrayContains(authorities, msg.sender));
        _;
    }

    /// Function used to accept messaged relayed from main chain.
    function acceptMessage(bytes32 transactionHash, bytes data, address sender, address recipient) public onlyAuthority() {
        // Protection from misbehaving authority
        bytes32 hash = keccak256(abi.encodePacked(transactionHash, data, sender, recipient));

        // don't allow authority to confirm deposit twice
        require(!Helpers.addressArrayContains(messages[hash], msg.sender));

        messages[hash].push(msg.sender);

        if (messages[hash].length != requiredSignatures) {
            return;
        }

        SideChainIdentity id;
        address identityAddress = ids[sender];
        if (identityAddress == 0) {
            id = new SideChainIdentity(sender, this);
            ids[sender] = id;
        } else {
            id = SideChainIdentity(identityAddress);
        }

        id.execute(data, recipient);
        emit AcceptedMessage(hash, sender, recipient);
    }

    /// Function used to check if authority has already accepted message from main chain.
    function hasAuthorityAcceptedMessageFromMain(
        bytes32 transactionHash,
        bytes data,
        address sender,
        address recipient,
        address authority
    ) public view returns (bool) {
        bytes32 hash = keccak256(abi.encodePacked(transactionHash, data, sender, recipient));
        return Helpers.addressArrayContains(messages[hash], authority);
    }
}


/// Every main chain address has it's own unique side chain identity.
contract SideChainIdentity {
    address public owner;
    address public side;

    constructor (address ownerParam, address sideParam) public {
        owner = ownerParam;
        side = sideParam;
    }

    modifier onlyOwnerOrBridge() {
        if (msg.sender == owner || msg.sender == side) {
            _;
        }
    }

    /// TODO: take gas into account
    function execute(bytes data, address recipient) public onlyOwnerOrBridge() {
        // assert or require here?
        // solium-disable-next-line security/no-low-level-calls
        assert(recipient.call(data));
    }
}
