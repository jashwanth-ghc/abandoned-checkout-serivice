// const express = require("express");
// const app = express();
const {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  // ListRulesCommand,
  RemoveTargetsCommand,
  DeleteRuleCommand
} = require("@aws-sdk/client-eventbridge");
const moment = require("moment");
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
  const delimiter = process.env.EB_RULE_PATTERN_DELIMITER
  const ruleNameArray = ruleName.split(delimiter);
  let ruleParams = {};
  ruleNamePattern.split(delimiter).forEach((ruleParamName, index) => {
    if (ruleParamName) {
      ruleParams[ruleParamName] = ruleNameArray[index]
    }
  });
  console.log("Timestamp: ", ruleParams.timestamp);
  // ruleParams.timestamp = ruleParams.timestamp.replaceAll("..", ":"); // Re-convert to valid date string
  return ruleParams;
}

async function processAbandonedCheckout(checkout, ruleParams) {
  try {
    console.log("Process Checkout Entered");
    throw new Error("");
  }
  catch (err) {
    console.log("Process checkout catch block entered");
    throw new CheckoutProcessFailedError("Checkout Processing Failed", checkout.id);
  }

}

async function recreateEbRule(abandonedCheckoutId, shop, ruleParams) {
  if (ruleParams.tryCount > process.env.MAX_TRY_COUNT) {
    console.log("Max try count reached for processing abandoned checkout with ID:", abandonedCheckoutId);
    return;
  }
  ruleParams.tryCount = parseInt(ruleParams.tryCount) + 1;
  return await createEbRule(abandonedCheckoutId, shop, ruleParams);
}

async function createEbRule(abandonedCheckoutId, shop, ruleParams) {
  const retryInterval = process.env.RETRY_INTERVALS.split(",")[ruleParams.tryCount - 2]; //corresponding index of array

  const t = moment.utc().add(retryInterval, 'm');
  const cronExpression = `cron(${t.minute()} ${t.hour()} ${t.date()} ${t.month() + 1} ? ${t.year()})`;
  const timeStamp = new Date().toISOString().replaceAll(":", "..");  //Aws rule name doesn't allow ":"

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
    console.log("Abandoned checkout Reminder rule created on AWS for checkoutId:", abandonedCheckoutId,
      " and retry count:", ruleParams.tryCount);

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
    console.log("Delete Rule entered");
    const response1 = await ebClient.send(removeTargetsCommand);
    if (!response1['$metadata'].httpStatusCode == 200) {
      throw new Error("Removing targets failed while deleting rule: ", ebRuleName);
    }
    console.log("Targets removed for rule: ", ebRuleName);
    const response2 = await ebClient.send(deleteRuleCommand);
    if (!response2['$metadata'].httpStatusCode == 200) {
      throw new Error("Delete rule failed for rule: ", ebRuleName);
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
  // context.callbackWaitsForEmptyEventLoop = true;
  await event.Records.forEach(async (record) => {
    const { body } = record;
    console.log(body);
    let ebRuleName = body.ruleName;
    const ruleParams = destructureAssign(ebRuleName);
    try {
      console.log("Handler try block entered");
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
      console.log("Handler catch block entered");
      if (err instanceof CheckoutProcessFailedError) {
        console.log("CheckoutProcessFailedError block entered");
        await recreateEbRule(err.checkoutId, body.shop, ruleParams);
      }
      console.log(err.message);
    }
    finally {
      console.log("Finally block entered");
      await deleteEbRule(ebRuleName);
    }
  });
  return {};
}