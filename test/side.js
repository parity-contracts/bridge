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
    var side_id;
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
      assert.equal("0xad1f82689b61e2dc97655a6fe253d885286c3c190d5cb1f26835673c705ce9d1", result.logs[0].args.messageID);
      assert.equal(userAccount, result.logs[0].args.sender);
      assert.equal(executed.address, result.logs[0].args.recipient);
      return meta.ids.call(userAccount);
    }).then(function(result) {
      assert.equal("0x409ba3dd291bb5d48d5b4404f5efa207441f6cba", result);
      side_id = SideChainIdentity.at(result);
      return side_id.owner.call();
    }).then(function(result) {
      assert.equal(userAccount, result);
      return side_id.side.call();
    }).then(function(result) {
      assert.equal(meta.address, result);
      return executed.lastData.call();
    }).then(function(result) {
      assert.equal("0x1234", result.substr(0, 6));
    });
  });

  it("should not allow random account to accept message", function() {
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

  it("should two authorities to accept the message", function() {
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
    var side_id;
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
      return meta.acceptMessage(transactionHash2, "0x123456", userAccount, executed.address, { from: authorities[0] });
    }).then(function(result) {
      assert.equal(1, result.logs.length);
      return executed.lastData.call();
    }).then(function(result) {
      assert.equal("0x123456", result.substr(0, 8));
    });
  });
})
