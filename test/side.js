var Side = artifacts.require("Side");
var SideChainIdentity = artifacts.require("SideChainIdentity");
var ExecuteTest = artifacts.require("ExecuteTest");
var helpers = require("./helpers/helpers");

function newSide(options) {
  return Side.new(
    options.requiredSignatures,
    options.authorities,
  )
}

contract('Side', function(accounts) {
  it("should deploy contract", function() {
    var meta;
    var authorities = [accounts[0], accounts[1]];
    var requiredSignatures = 1;

    return newSide({
      requiredSignatures: requiredSignatures,
      authorities: authorities,
    }).then(function(instance) {
      meta = instance;

      return web3.eth.getTransactionReceipt(instance.transactionHash);
    }).then(function(transaction) {
      console.log("estimated gas cost of Side deploy =", transaction.gasUsed);

      return meta.requiredSignatures.call();
    }).then(function(result) {
      assert.equal(requiredSignatures, result, "Contract has invalid number of requiredSignatures");

      return Promise.all(authorities.map((_, index) => meta.authorities.call(index)));
    }).then(function(result) {
      assert.deepEqual(authorities, result, "Contract has invalid authorities");
    })
  })

  it("should fail to deploy contract with not enough required signatures", function() {
    var authorities = [accounts[0], accounts[1]];
    return newSide({
      requiredSignatures: 0,
      authorities: authorities,
    })
      .then(function() {
        assert(false, "Contract should fail to deploy");
      }, helpers.ignoreExpectedError)
  })

  it("should fail to deploy contract with too many signatures", function() {
    var authorities = [accounts[0], accounts[1]];
    return newSide({
      requiredSignatures: 3,
      authorities: authorities,
    })
      .then(function() {
        assert(false, "Contract should fail to deploy");
      }, helpers.ignoreExpectedError)
  })

  it("should allow a single authority to accept message", function() {
    var executed;
    var meta;
    var sideID;
    var requiredSignatures = 1;
    var authorities = [accounts[0], accounts[1]];
    var userAccount = accounts[2];
    var transactionHash = "0x20393f23b0b9b5f12d67e49d6541d4daf085c7b6a402f67e6e98dc81e0550963";

    return ExecuteTest.new().then(function(result) {
      executed = result;
      return Side.new(requiredSignatures, authorities);
    }).then(function(instance) {
      meta = instance;
      return meta.acceptMessage(transactionHash, "0x1234", userAccount, executed.address, { from: authorities[0] });
    }).then(function(result) {
      assert.equal(1, result.logs.length);
      assert.equal("AcceptedMessage", result.logs[0].event);
      var packed = transactionHash + "1234" + userAccount.substr(2) + executed.address.substr(2);
      assert.equal(web3.sha3(packed, { encoding: 'hex' }), result.logs[0].args.messageID);
      assert.equal(userAccount, result.logs[0].args.sender);
      assert.equal(executed.address, result.logs[0].args.recipient);
      return meta.ids.call(userAccount);
    }).then(function(result) {
      sideID = SideChainIdentity.at(result);
      return sideID.owner.call();
    }).then(function(result) {
      assert.equal(userAccount, result);
      return sideID.side.call();
    }).then(function(result) {
      assert.equal(meta.address, result);
      return executed.lastData.call();
    }).then(function(result) {
      assert.equal("0x1234", result.substr(0, 6));
    });
  });

  it("should not allow accept message from non-authority account", function() {
    var meta;
    var requiredSignatures = 1;
    var authorities = [accounts[0], accounts[1]];
    var userAccount = accounts[2];
    var recipientAccount = accounts[3];
    var transactionHash = "0x20393f23b0b9b5f12d67e49d6541d4daf085c7b6a402f67e6e98dc81e0550963";

    return Side.new(requiredSignatures, authorities).then(function(instance) {
      meta = instance;
      return meta.acceptMessage(transactionHash, "0x1234", userAccount, recipientAccount, { from: userAccount });
    }).then(function(result) {
      assert(false, "Contract should call revert");
    }, helpers.ignoreExpectedError);
  });

  it("should not allow message to be accepted twice by the same authority", function() {
    var meta;
    var requiredSignatures = 2;
    var authorities = [accounts[0], accounts[1]];
    var userAccount = accounts[2];
    var recipientAccount = accounts[3];
    var transactionHash = "0x20393f23b0b9b5f12d67e49d6541d4daf085c7b6a402f67e6e98dc81e0550963";

    return Side.new(requiredSignatures, authorities).then(function(instance) {
      meta = instance;
      return meta.acceptMessage(transactionHash, "0x1234", userAccount, recipientAccount, { from: authorities[0] });
    }).then(function(result) {
      assert.equal(0, result.logs.length);
      return meta.acceptMessage(transactionHash, "0x1234", userAccount, recipientAccount, { from: authorities[0] });
    }).then(function(result) {
      assert(false, "Contract should call revert");
    }, helpers.ignoreExpectedError);
  });

  it("should require two authorities to accept the message", function() {
    var meta;
    var requiredSignatures = 2;
    var authorities = [accounts[0], accounts[1]];
    var userAccount = accounts[2];
    var recipientAccount = accounts[3];
    var transactionHash = "0x20393f23b0b9b5f12d67e49d6541d4daf085c7b6a402f67e6e98dc81e0550963";

    return Side.new(requiredSignatures, authorities).then(function(instance) {
      meta = instance;
      return meta.acceptMessage(transactionHash, "0x1234", userAccount, recipientAccount, { from: authorities[0] });
    }).then(function(result) {
      assert.equal(0, result.logs.length);
      return meta.acceptMessage(transactionHash, "0x1234", userAccount, recipientAccount, { from: authorities[1] });
    }).then(function(result) {
      assert.equal(1, result.logs.length);
    });
  });

  it("should reuse side chain identity for two messages", function() {
    var executed;
    var meta;
    var sideID;
    var requiredSignatures = 1;
    var authorities = [accounts[0], accounts[1]];
    var userAccount = accounts[2];
    var transactionHash = "0x20393f23b0b9b5f12d67e49d6541d4daf085c7b6a402f67e6e98dc81e0550963";
    var transactionHash2 = "0x20393f23b0b9b5f12d67e49d6541d4daf085c7b6a402f67e6e98dc81e0550964";

    return ExecuteTest.new().then(function(result) {
      executed = result;
      return Side.new(requiredSignatures, authorities);
    }).then(function(instance) {
      meta = instance;
      return meta.acceptMessage(transactionHash, "0x1234", userAccount, executed.address, { from: authorities[0] });
    }).then(function(result) {
      assert.equal(1, result.logs.length);
      return executed.lastData.call();
    }).then(function(result) {
      assert.equal("0x1234", result.substr(0, 6));
      return executed.lastSender.call();
    }).then(function(result) {
      sideID = result;
      return meta.acceptMessage(transactionHash2, "0x123456", userAccount, executed.address, { from: authorities[0] });
    }).then(function(result) {
      assert.equal(1, result.logs.length);
      return executed.lastData.call();
    }).then(function(result) {
      assert.equal("0x123456", result.substr(0, 8));
      return executed.lastSender.call();
    }).then(function(result) {
      assert.equal(sideID, result);
    });
  });

  it("should get valid results from hasAuthorityAcceptedMessageFromMain", function () {
    var meta;
    var requiredSignatures = 1;
    var authorities = [accounts[0], accounts[1]];
    var userAccount = accounts[2];
    var recipientAccount = accounts[3];
    var transactionHash = "0x20393f23b0b9b5f12d67e49d6541d4daf085c7b6a402f67e6e98dc81e0550963";

    return Side.new(requiredSignatures, authorities).then(function(instance) {
      meta = instance;
      return meta.hasAuthorityAcceptedMessageFromMain.call(transactionHash, "0x1234", userAccount, recipientAccount, authorities[0]);
    }).then(function(result) {
      assert.equal(false, result);
      return meta.acceptMessage(transactionHash, "0x1234", userAccount, recipientAccount, { from: authorities[0] });
    }).then(function(result) {
      return meta.hasAuthorityAcceptedMessageFromMain.call(transactionHash, "0x1234", userAccount, recipientAccount, authorities[0]);
    }).then(function(result) {
      assert.equal(true, result);
    });
  });

  it("should successfully submit message and trigger SignedMessage event", function() {
    var meta;
    var signature;
    var requiredSignatures = 1;
    var authorities = [accounts[0], accounts[1]];
    var recipientAccount = accounts[2];
    var transactionHash = "0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80";
    var mainGasPrice = web3.toBigNumber(web3.toWei(3, "gwei"));
    var message = "0x1234";
    return Side.new(requiredSignatures, authorities).then(function(instance) {
      meta = instance;

      return meta.hasAuthoritySignedMessage(authorities[0], message);
    }).then(function(result) {
      assert.equal(result, false)

      return helpers.sign(authorities[0], message);
    }).then(function(result) {
      signature = result;

      return meta.submitSignedMessage(result, message, { from: authorities[0] });
    }).then(function(result) {
      assert.equal(1, result.logs.length, "Exactly one event should be created");
      assert.equal("SignedMessage", result.logs[0].event, "Event name should be SignedMessage");
      assert.equal(authorities[0], result.logs[0].args.authorityResponsibleForRelay, "Event authority should be equal to transaction sender");

      return Promise.all([
        meta.signature.call(result.logs[0].args.messageHash, 0),
        meta.message(result.logs[0].args.messageHash),
      ])
    }).then(function(result) {
      assert.equal(signature, result[0]);
      assert.equal(message, result[1]);

      return meta.hasAuthoritySignedMessage(authorities[0], message);
    }).then(function(result) {
      assert.equal(result, true)
    })
  });

  it("should successfully submit message but not trigger SignedMessage event", function() {
    var meta;
    var requiredSignatures = 2;
    var authorities = [accounts[0], accounts[1]];
    var recipientAccount = accounts[2];
    var transactionHash = "0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80";
    var mainGasPrice = web3.toBigNumber(web3.toWei(3, "gwei"));
    var message = "0x1234";
    var signature;

    return Side.new(requiredSignatures, authorities).then(function(instance) {
      meta = instance;

      return helpers.sign(authorities[0], message);
    }).then(function(result) {
      signature = result;

      return meta.submitSignedMessage.estimateGas(result, message, { from: authorities[0] });
    }).then(function(result) {
      console.log("estimated gas cost of SideBridge.submitSignature =", result);

      return meta.hasAuthoritySignedMessage(authorities[0], message);
    }).then(function(result) {
      assert.equal(result, false)

      return meta.submitSignedMessage(signature, message, { from: authorities[0] });
    }).then(function(result) {
      assert.equal(0, result.logs.length, "No events should be created");
    })
  });

  it("should be able to submit multiple messages in parallel", function() {
    var meta;
    var signatures_for_message = [];
    var signatures_for_message2 = [];
    var requiredSignatures = 2;
    var estimatedGasCostOfWithdraw = 0;
    var authorities = [accounts[0], accounts[1]];
    var recipientAccount = accounts[2];
    var transactionHash = "0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80";
    var mainGasPrice = web3.toBigNumber(web3.toWei(3, "gwei"));
    var message = "0x1234";
    var message2 = "0x123456";
    return Side.new(requiredSignatures, authorities).then(function(instance) {
      meta = instance;
      return Promise.all([
        helpers.sign(authorities[0], message),
        helpers.sign(authorities[1], message),
        helpers.sign(authorities[0], message2),
        helpers.sign(authorities[1], message2),
      ]);
    }).then(function(result) {
      signatures_for_message.push(result[0]);
      signatures_for_message.push(result[1]);
      signatures_for_message2.push(result[2]);
      signatures_for_message2.push(result[3]);
      return meta.submitSignedMessage(signatures_for_message[0], message, { from: authorities[0] });
    }).then(function(result) {
      assert.equal(0, result.logs.length, "No events should be created");

      return meta.submitSignedMessage(signatures_for_message2[1], message2, { from: authorities[1] });
    }).then(function(result) {
      assert.equal(0, result.logs.length, "No events should be created");

      return meta.submitSignedMessage(signatures_for_message2[0], message2, { from: authorities[0] });
    }).then(function(result) {
      assert.equal(1, result.logs.length, "Exactly one event should be created");
      assert.equal("SignedMessage", result.logs[0].event, "Event name should be SignedMessage");
      assert.equal(authorities[0], result.logs[0].args.authorityResponsibleForRelay, "Event authority should be equal to transaction sender");
      return Promise.all([
        meta.signature.call(result.logs[0].args.messageHash, 0),
        meta.signature.call(result.logs[0].args.messageHash, 1),
        meta.message(result.logs[0].args.messageHash),
      ])
    }).then(function(result) {
      assert.equal(signatures_for_message2[1], result[0]);
      assert.equal(signatures_for_message2[0], result[1]);
      assert.equal(message2, result[2]);
      return meta.submitSignedMessage(signatures_for_message[1], message, { from: authorities[1] });
    }).then(function(result) {
      assert.equal(1, result.logs.length, "Exactly one event should be created");
      assert.equal("SignedMessage", result.logs[0].event, "Event name should be SignedMessage");
      assert.equal(authorities[1], result.logs[0].args.authorityResponsibleForRelay, "Event authority should be equal to transaction sender");
      return Promise.all([
        meta.signature.call(result.logs[0].args.messageHash, 0),
        meta.signature.call(result.logs[0].args.messageHash, 1),
        meta.message(result.logs[0].args.messageHash),
      ])
    }).then(function(result) {
      assert.equal(signatures_for_message[0], result[0]);
      assert.equal(signatures_for_message[1], result[1]);
      assert.equal(message, result[2]);
    })
  });

  it("should not be possible to submit message twice", function() {
    var meta;
    var requiredSignatures = 1;
    var authorities = [accounts[0], accounts[1]];
    var recipientAccount = accounts[2];
    var transactionHash = "0x1045bfe274b88120a6b1e5d01b5ec00ab5d01098346e90e7c7a3c9b8f0181c80";
    var mainGasPrice = web3.toBigNumber(web3.toWei(3, "gwei"));
    var message = "0x1234";
    var signature;
    return Side.new(requiredSignatures, authorities).then(function(instance) {
      meta = instance;
      return helpers.sign(authorities[0], message);
    }).then(function(result) {
      signature = result;
      return meta.submitSignedMessage(signature, message, { from: authorities[0] });
    }).then(function(_) {
      return meta.submitSignedMessage(signature, message, { from: authorities[0] })
        .then(function() {
          assert(false, "submitSignedMessage should fail");
        }, helpers.ignoreExpectedError)
    })
  });

});
