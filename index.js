const moment = require("moment");
const {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
  DeleteRuleCommand
} = require("@aws-sdk/client-eventbridge");
require("dotenv").config();
const { getCheckoutObject, deleteCheckoutObject } = require("./database.js");


const config = {
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY
  },
  region: process.env.REGION
}

const ebClient = new EventBridgeClient(config);

function destructureAssign(ruleName) {
  const ruleNamePattern = process.env.EB_RULE_PATTERN;
  const delimiter = process.env.EB_RULE_PATTERN_DELIMITER;
  const ruleNameArray = ruleName.split(delimiter);
  let ruleParams = {};

  ruleNamePattern.split(delimiter).forEach((ruleParamName, index) => {
    if (ruleParamName) {
      ruleParams[ruleParamName] = ruleNameArray[index];
    }
  });

  ruleParams.timestamp = ruleParams.timestamp.split("..").join(":"); // Re-convert to valid date string
  ruleParams.tryCount = parseInt(ruleParams.tryCount);
  return ruleParams;
}

async function processAbandonedCheckout(checkout, ruleParams) {
  try {
    if (ruleParams.tryCount > 2){
      console.log("Checkout processing succeeded for checkout: ", checkout.id);
      return;
    }
      throw new Error("");
  }
  catch (err) {
    throw new CheckoutProcessFailedError("Checkout Processing Failed", checkout.id);
  }
}

async function recreateEbRule(abandonedCheckoutId, shop, ruleParams) {
  if ( ruleParams.tryCount > parseInt(process.env.MAX_TRY_COUNT) ) {
    console.log("Max try count reached for processing abandoned checkout with ID:", abandonedCheckoutId);
    return;
  }

  ruleParams.tryCount = ruleParams.tryCount + 1;

  return await createEbRule(abandonedCheckoutId, shop, ruleParams);
}

async function createEbRule(abandonedCheckoutId, shop, ruleParams) {
  const retryInterval = parseInt(process.env.RETRY_INTERVALS.split("-")[ruleParams.tryCount - 2]); //corresponding index of array

  const t = moment.utc().add(retryInterval, 'm');
  const cronExpression = `cron(${t.minute()} ${t.hour()} ${t.date()} ${t.month() + 1} ? ${t.year()})`;
  const timeStamp = new Date().toISOString().split(":").join("..");  //Aws rule name doesn't allow ":"

  const ruleName = `${ruleParams.ruleType}--${abandonedCheckoutId}--${timeStamp}--${ruleParams.tryCount}`;

  const putRuleCommand = new PutRuleCommand({
    Name: ruleName,
    ScheduleExpression: cronExpression,
    State: "ENABLED"
  });

  const putTargetsCommand = new PutTargetsCommand({
    Rule: ruleName,
    Targets: [
      {
        Id: "abandonedCheckoutProcessQueue",
        Arn: process.env.AWS_ABND_CHKT_SQS_ARN,
        Input: JSON.stringify({
          checkoutId: abandonedCheckoutId,
          shop,
          ruleName
        })
      }
    ]
  });

  try {
    const data1 = await ebClient.send(putRuleCommand);

    if (!data1['$metadata'].httpStatusCode == 200) {
      throw new Error("Failed to Write AWS EB Rule");
    }
    console.log("Rule created to retry failed process checkout :", abandonedCheckoutId,
      " with retry count:", ruleParams.tryCount);

    const data2 = await ebClient.send(putTargetsCommand);
    if (!data2['$metadata'].httpStatusCode == 200) {
      throw new Error("Failed to Write Targets to AWS EB Rule");
    }
  }
  catch (err) {
    console.log(err);
  }
}

async function deleteEbRule(ebRuleName) {
  const removeTargetsCommand = new RemoveTargetsCommand({
    Ids: [process.env.AWS_ABND_CHKT_SQS_ID],
    Rule: ebRuleName
  });

  const deleteRuleCommand = new DeleteRuleCommand({
    Name: ebRuleName
  });

  try {
    const response1 = await ebClient.send(removeTargetsCommand);
    if (!response1['$metadata'].httpStatusCode == 200) {
      throw new Error("Delete-rule failed. Removing targets failed while deleting rule: ", ebRuleName);
    }

    const response2 = await ebClient.send(deleteRuleCommand);
    if (!response2['$metadata'].httpStatusCode == 200) {
      throw new Error("Delete-rule failed for rule: ", ebRuleName);
    }
    console.log("Rule deleted: ", ebRuleName);
  }
  catch (err) {
    console.log(err);
  }
}

class CheckoutProcessFailedError extends Error {
  constructor(message, checkoutId) {
    super(message);
    this.name = "CheckoutProcessFailedError";
    this.checkoutId = checkoutId;
  }
}

exports.handler = async function (event, context) {
  console.log(event);
  for (const record of event.Records) {
    let { body } = record;
    body = JSON.parse(body);
    let ebRuleName = body.ruleName;

    const ruleParams = destructureAssign(ebRuleName);

    try {
      const checkout = await getCheckoutObject(body.checkoutId, body.shop);
      if (!checkout) {
        console.log("Abandoned checkout with id:", body.checkoutId,
          " not found in Database. Checkout process might have been completed by customer.");
        return {};
      }

      await processAbandonedCheckout(checkout, ruleParams);

      await deleteCheckoutObject(body.checkoutId, body.shop);
    }
    catch (err) {
      if (err instanceof CheckoutProcessFailedError) {
        await recreateEbRule(err.checkoutId, body.shop, ruleParams);
      }
      console.log(err.message);
    }
    finally {
      await deleteEbRule(ebRuleName);
    }
  }

  return {};
}