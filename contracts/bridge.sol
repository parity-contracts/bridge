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

pragma solidity ^0.5.0;


/// An interface of the bridge contract on both chains. Call this method to relay
/// the message to the other chain. `recipient` is an anddress of `BridgeRecipient`
/// contract on the other chain.
interface Bridge {
    function relayMessage(bytes calldata data, address recipient) external;
}


/// Interface that needs to be implemented by message receipient.
interface BridgeRecipient {
    function acceptMessage(bytes calldata data, address sender) external;
}


/// General helpers.
/// `internal` so they get compiled into contracts using them.
library Helpers {
    /// returns whether `array` contains `value`.
    function addressArrayContains(address[] memory array, address value) internal pure returns (bool) {
        for (uint256 i = 0; i < array.length; i++) {
            if (array[i] == value) {
                return true;
            }
        }
        return false;
    }

    // returns the digits of `inputValue` as a string.
    // example: `uintToString(12345678)` returns `"12345678"`
    function uintToString(uint256 inputValue) internal pure returns (string memory) {
        // figure out the length of the resulting string
        uint256 length = 0;
        uint256 currentValue = inputValue;
        do {
            length++;
            currentValue /= 10;
        } while (currentValue != 0);
        // allocate enough memory
        bytes memory result = new bytes(length);
        // construct the string backwards
        uint256 i = length - 1;
        currentValue = inputValue;
        do {
            result[i--] = byte(uint8(48 + currentValue % 10));
            currentValue /= 10;
        } while (currentValue != 0);
        return string(result);
    }

    /// returns whether signatures (whose components are in `vs`, `rs`, `ss`)
    /// contain `requiredSignatures` distinct correct signatures
    /// where signer is in `allowedSigners`
    /// that signed `message`
    function hasEnoughValidSignatures(
        bytes memory message,
        uint8[] memory vs,
        bytes32[] memory rs,
        bytes32[] memory ss,
        address[] memory allowedSigners,
        uint256 requiredSignatures
    ) internal pure returns (bool)
    {
        bytes32 hash = MessageSigning.hashMessage(message);
        address[] memory encounteredAddresses = new address[](allowedSigners.length);

        for (uint256 i = 0; i < requiredSignatures; i++) {
            address recoveredAddress = ecrecover(hash, vs[i], rs[i], ss[i]);
            // only signatures by addresses in `addresses` are allowed
            if (!addressArrayContains(allowedSigners, recoveredAddress)) {
                return false;
            }
            // duplicate signatures are not allowed
            if (addressArrayContains(encounteredAddresses, recoveredAddress)) {
                return false;
            }
            encounteredAddresses[i] = recoveredAddress;
        }
        return true;
    }
}


/// Library used only to test Helpers library via rpc calls
contract HelpersTest {
    function addressArrayContains(address[] memory array, address value) public pure returns (bool) {
        return Helpers.addressArrayContains(array, value);
    }

    function uintToString(uint256 inputValue) public pure returns (string memory str) {
        return Helpers.uintToString(inputValue);
    }

    function hasEnoughValidSignatures(
        bytes memory message,
        uint8[] memory vs,
        bytes32[] memory rs,
        bytes32[] memory ss,
        address[] memory addresses,
        uint256 requiredSignatures
    ) public pure returns (bool)
    {
        return Helpers.hasEnoughValidSignatures(message, vs, rs, ss, addresses, requiredSignatures);
    }
}


// helpers for message signing.
// `internal` so they get compiled into contracts using them.
library MessageSigning {
    function recoverAddressFromSignedMessage(bytes memory signature, bytes memory message) internal pure returns (address) {
        require(signature.length == 65, "Signature must be 65 bytes long.");
        bytes32 r;
        bytes32 s;
        bytes1 v;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := mload(add(signature, 0x60))
        }
        return ecrecover(hashMessage(message), uint8(v), r, s);
    }

    function hashMessage(bytes memory message) internal pure returns (bytes32) {
        bytes memory prefix = "\x19Ethereum Signed Message:\n";
        return keccak256(abi.encodePacked(prefix, Helpers.uintToString(message.length), message));
    }
}


/// Library used only to test MessageSigning library via rpc calls
contract MessageSigningTest {
    function recoverAddressFromSignedMessage(bytes memory signature, bytes memory message) public pure returns (address) {
        return MessageSigning.recoverAddressFromSignedMessage(signature, message);
    }
}


/// Part of the bridge that needs to be deployed on the main chain.
contract Main is Bridge {
    /// Number of authorities signatures required to relay the message.
    /// Must be less than a number of authorities.
    uint256 public requiredSignatures;
    /// List of authorities.
    address[] public authorities;
    /// Ids of accepted messages from side chain.
    mapping (bytes32 => bool) public acceptedMessages;
    /// Ids of messages that are being relayed mapped to the messages.
    mapping (bytes32 => bytes) public relayedMessages;

    /// Message accepted from the main chain.
    event AcceptedMessage(bytes32 messageID, address sender, address recipient);
    /// Event created when new message needs to be passed to the side chain.
    event RelayMessage(bytes32 messageID, address sender, address recipient);

    constructor (
        uint256 requiredSignaturesParam,
        address[] memory authoritiesParam
    ) public {
        require(requiredSignaturesParam != 0, "Can't have zero required signatures");
        require(requiredSignaturesParam <= authoritiesParam.length, "Can't require more signatures than there're authorities");
        requiredSignatures = requiredSignaturesParam;
        authorities = authoritiesParam;
    }

    /// Call this function to relay this message to the side chain.
    function relayMessage(bytes calldata data, address recipient) external {
        bytes32 messageID = keccak256(data);
        relayedMessages[messageID] = data;
        emit RelayMessage(messageID, msg.sender, recipient);
    }

    /// Function used to accept messaged relayed from side chain.
    function acceptMessage(
        uint8[] calldata vs,
        bytes32[] calldata rs,
        bytes32[] calldata ss,
        bytes32 transactionHash,
        bytes calldata data,
        address sender,
        address recipient
    ) external
    {
        bytes memory asBytes = abi.encodePacked(transactionHash, keccak256(data), sender, recipient);
        bytes32 hash = keccak256(asBytes);
        require(
            Helpers.hasEnoughValidSignatures(asBytes, vs, rs, ss, authorities, requiredSignatures),
            "Invalid signatures."
        );
        require(!acceptedMessages[hash], "Message already accepted.");
        acceptedMessages[hash] = true;

        // everything is fine, accept the message
        BridgeRecipient bridgeRecipient = BridgeRecipient(recipient);
        bridgeRecipient.acceptMessage(data, sender);
        emit AcceptedMessage(hash, sender, recipient);
    }

    /// Called by the bridge node processes on startup
    /// to determine early whether the address pointing to the main
    /// bridge contract is misconfigured.
    /// so we can provide a helpful error message instead of the very
    /// unhelpful errors encountered otherwise.
    function isMainBridgeContract() public pure returns (bool) {
        return true;
    }
}


/// Part of the bridge that needs to be deployed on the side chain.
contract Side is Bridge {
    /// Definition of the structure that holds all authorites signatures
    /// before relaying them to the `Main`
    struct SignaturesCollection {
        /// Signed message.
        bytes message;
        /// Authorities who signed the message.
        address[] authorities;
        /// Signatures
        bytes[] signatures;
    }

    /// Number of authorities signatures required to relay the message.
    /// Must be less than a number of authorities.
    uint256 public requiredSignatures;
    /// List of authorities.
    address[] public authorities;
    /// Ids of messages that are being accepted mapped to authorities addresses, who
    /// already confirmed them.
    mapping (bytes32 => address[]) public acceptedMessages;
    /// Ids of messages that are being relayed mapped to the messages.
    mapping (bytes32 => bytes) public relayedMessages;
    /// Messages that are being relayed to the main network and authorities who
    /// already confirmed them.
    mapping (bytes32 => SignaturesCollection) signatures;

    /// Message accepted from the main chain.
    event AcceptedMessage(bytes32 messageID, address sender, address recipient);
    /// Message which should be relayed to the main chain.
    event SignedMessage(address indexed authorityResponsibleForRelay, bytes32 messageHash);
    /// Event created when new message needs to be passed to the main chain.
    event RelayMessage(bytes32 messageID, address sender, address recipient);

    constructor (
        uint256 requiredSignaturesParam,
        address[] memory authoritiesParam
    ) public {
        require(requiredSignaturesParam != 0, "Can't have zero required signatures");
        require(requiredSignaturesParam <= authoritiesParam.length, "Can't require more signatures than there're authorities");
        requiredSignatures = requiredSignaturesParam;
        authorities = authoritiesParam;
    }

    /// Require sender to be an authority.
    modifier onlyAuthority() {
        require(Helpers.addressArrayContains(authorities, msg.sender), "msg.sender is not one of the authorities");
        _;
    }

    /// Call this function to relay this message to the main chain.
    function relayMessage(bytes calldata data, address recipient) external {
        bytes32 messageID = keccak256(data);
        relayedMessages[messageID] = data;
        emit RelayMessage(messageID, msg.sender, recipient);
    }

    /// Function used to accept messages relayed from main chain.
    function acceptMessage(
        bytes32 transactionHash,
        bytes calldata data,
        address sender,
        address recipient
    ) external onlyAuthority()
    {
        // Protection from misbehaving authority
        bytes32 hash = keccak256(abi.encodePacked(transactionHash, data, sender, recipient));

        // don't allow authority to confirm deposit twice
        require(!Helpers.addressArrayContains(acceptedMessages[hash], msg.sender), "Can't confirm the same deposit twice");

        acceptedMessages[hash].push(msg.sender);

        if (acceptedMessages[hash].length != requiredSignatures) {
            return;
        }

        // everything is fine, accept the message
        BridgeRecipient bridgeRecipient = BridgeRecipient(recipient);
        bridgeRecipient.acceptMessage(data, sender);
        emit AcceptedMessage(hash, sender, recipient);
    }

    /// Message is a message that should be relayed to main chain once authorities sign it.
    ///
    /// message contains:
    /// side transaction hash (bytes32)
    /// message_id (bytes32)
    /// sender (bytes20)
    /// recipient (bytes20)
    function submitSignedMessage(bytes memory signature, bytes memory message) public onlyAuthority() {
        // ensure that `signature` is really `message` signed by `msg.sender`
        require(
            msg.sender == MessageSigning.recoverAddressFromSignedMessage(signature, message),
            "Message must be signed by msg.sender."
        );

        bytes32 hash = keccak256(message);

        // each authority can only provide one signature per message
        require(
            !Helpers.addressArrayContains(signatures[hash].authorities, msg.sender),
            "Only authority can submit signed message."
        );
        signatures[hash].message = message;
        signatures[hash].authorities.push(msg.sender);
        signatures[hash].signatures.push(signature);

        if (signatures[hash].authorities.length == requiredSignatures) {
            emit SignedMessage(msg.sender, hash);
        }
    }

    /// Function used to check if authority has already accepted message from main chain.
    function hasAuthorityAcceptedMessageFromMain(
        bytes32 transactionHash,
        bytes memory data,
        address sender,
        address recipient,
        address authority
    ) public view returns (bool)
    {
        bytes32 hash = keccak256(abi.encodePacked(transactionHash, data, sender, recipient));
        return Helpers.addressArrayContains(acceptedMessages[hash], authority);
    }

    /// Function used to check if authority has already signed the message.
    function hasAuthoritySignedMessage(address authority, bytes memory message) public view returns (bool) {
        bytes32 messageHash = keccak256(message);
        return Helpers.addressArrayContains(signatures[messageHash].authorities, authority);
    }

    /// Get signature
    function signature(bytes32 messageHash, uint256 index) public view returns (bytes memory) {
        return signatures[messageHash].signatures[index];
    }

    /// Get message
    function message(bytes32 messageHash) public view returns (bytes memory) {
        return signatures[messageHash].message;
    }

    // Called by the bridge node processes on startup
    // to determine early whether the address pointing to the side
    // bridge contract is misconfigured.
    // so we can provide a helpful error message instead of the
    // very unhelpful errors encountered otherwise.
    function isSideBridgeContract() public pure returns (bool) {
        return true;
    }
}


contract RecipientTest is BridgeRecipient {
    bytes public lastData;
    address public lastSender;

    modifier customModifier() {
        _;
    }

    function acceptMessage(bytes calldata data, address sender) external customModifier() {
        lastData = data;
        lastSender = sender;
    }
}
