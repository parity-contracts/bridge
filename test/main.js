var Main = artifacts.require("Main");
var helpers = require("./helpers/helpers");

function newMain(options) {
  return Main.new(
    options.requiredSignatures,
    options.authorities,
  )
}

contract('Main', function(accounts) {
  it("should deploy contract", function() {
    var meta;
    var authorities = [accounts[0], accounts[1]];
    var requiredSignatures = 1;

    return newMain({
      requiredSignatures: requiredSignatures,
      authorities: authorities,
    }).then(function(instance) {
      meta = instance;

      return web3.eth.getTransactionReceipt(instance.transactionHash);
    }).then(function(transaction) {
      console.log("estimated gas cost of Main deploy =", transaction.gasUsed);

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
    return newMain({
      requiredSignatures: 0,
      authorities: authorities,
    })
      .then(function() {
        assert(false, "Contract should fail to deploy");
      }, helpers.ignoreExpectedError)
  })

  it("should fail to deploy contract with too many signatures", function() {
    var authorities = [accounts[0], accounts[1]];
    return newMain({
      requiredSignatures: 3,
      authorities: authorities,
    })
      .then(function() {
        assert(false, "Contract should fail to deploy");
      }, helpers.ignoreExpectedError)
  })

  it("should create relay message event", function() {
    var meta;
    var tx;
    var requiredSignatures = 1;
    var authorities = [accounts[0], accounts[1]];
    let userAccount = accounts[2];
    let recipientAccount = accounts[3];
    let value = web3.toWei(1, "ether");

    return newMain({
      requiredSignatures: requiredSignatures,
      authorities: authorities,
    }).then(function(instance) {
      meta = instance;

      return meta.relayMessage("0x1234", recipientAccount, { from: userAccount });
    }).then(function(result) {
      tx = result.tx;

      assert.equal(1, result.logs.length, "Exactly one event should have been created");
      assert.equal("RelayMessage", result.logs[0].event, "Event name should be RelayMessage");
      assert.equal(
        "0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432",
        result.logs[0].args.messageID,
        "Event messageID invalid"
      );
      assert.equal(userAccount, result.logs[0].args.sender, "Event sender invalid");
      assert.equal(recipientAccount, result.logs[0].args.recipient, "Event recipient invalid");
      return meta.relayedMessages.call(result.logs[0].args.messageID);
    }).then(function(message) {
      assert.equal("0x1234", message);
      return web3.eth.getTransactionReceipt(tx);
    }).then(function(transaction) {
      console.log("estimated gas cost of Main relayMessage function =", transaction.gasUsed);
    })
  })
})
