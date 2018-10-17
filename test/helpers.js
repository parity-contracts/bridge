// solidity Helpers library
var Helpers = artifacts.require("HelpersTest");

contract("Helpers", function(accounts) {
  it("`addressArrayContains` should function correctly", function() {
    var addresses = accounts.slice(0, 3);
    var otherAddress = accounts[3];
    var library;
    return Helpers.new().then(function(instance) {
      library = instance;

      return library.addressArrayContains.call([], otherAddress);
    }).then(function(result) {
      assert.equal(result, false, "should return false for empty array");

      return library.addressArrayContains.call([otherAddress], otherAddress);
    }).then(function(result) {
      assert.equal(result, true, "should return true for singleton array containing value");

      return library.addressArrayContains.call([addresses[0]], addresses[1]);
    }).then(function(result) {
      assert.equal(result, false, "should return false for singleton array not containing value");

      return library.addressArrayContains.call(addresses, addresses[0]);
    }).then(function(result) {
      assert.equal(result, true);

      return library.addressArrayContains.call(addresses, addresses[1]);
    }).then(function(result) {
      assert.equal(result, true);

      return library.addressArrayContains.call(addresses, addresses[2]);
    }).then(function(result) {
      assert.equal(result, true);

      return library.addressArrayContains.call(addresses, otherAddress);
    }).then(function(result) {
      assert.equal(result, false);
    })
  })
})
