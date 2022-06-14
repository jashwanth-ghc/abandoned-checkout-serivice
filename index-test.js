const{ testAsyncFunc } = require("./test-export.js");

exports.handler = async function (event, context) {
    // context.callbackWaitsForEmptyEventLoop = true;
    await event.Records.forEach(async (record) => {
      const { body } = record;
      console.log(body);
      let ebRuleName = body.ruleName;
      const ruleParams = destructureAssign(ebRuleName);
      try {
        console.log("Handler try block entered");
        
        const response = await testAsyncFunc(body.checkoutId, body.shop);
      }
      catch (err) {        
        console.log(err.message);
      }
    //   finally {
    //     console.log("Finally block entered");    //     
    //   }
    });
    return {};
}