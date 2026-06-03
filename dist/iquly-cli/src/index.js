#!/usr/bin/env node
import { runLogin, runLogout, runWhoAmI } from "./auth-commands.js";
import { Command, Help } from "commander";
import { runInit } from "./init.js";
import { runPush } from "./push.js";
class IqulyHelp extends Help {
    formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth || 80;
        const itemIndentWidth = 2;
        const itemSeparatorWidth = 2;
        function formatItem(term, description) {
            if (description) {
                const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
                return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
            }
            return term;
        }
        function formatList(textArray) {
            return textArray.join("\n").replace(/^/gm, " ".repeat(itemIndentWidth));
        }
        let output = [];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
            output = output.concat([helper.wrap(commandDescription, helpWidth, 0), ""]);
        }
        output = output.concat([`Usage: ${helper.commandUsage(cmd)}`, ""]);
        const commandList = helper.visibleCommands(cmd).map((subcommand) => formatItem(helper.subcommandTerm(subcommand), helper.subcommandDescription(subcommand)));
        if (commandList.length > 0) {
            output = output.concat(["Commands:", formatList(commandList), ""]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => formatItem(helper.argumentTerm(argument), helper.argumentDescription(argument)));
        if (argumentList.length > 0) {
            output = output.concat(["Arguments:", formatList(argumentList), ""]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => formatItem(helper.optionTerm(option), helper.optionDescription(option)));
        if (optionList.length > 0) {
            output = output.concat(["Options:", formatList(optionList), ""]);
        }
        if (this.showGlobalOptions) {
            const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => formatItem(helper.optionTerm(option), helper.optionDescription(option)));
            if (globalOptionList.length > 0) {
                output = output.concat(["Global Options:", formatList(globalOptionList), ""]);
            }
        }
        return output.join("\n");
    }
}
const program = new Command();
program.createHelp = () => new IqulyHelp();
program
    .name("iquly")
    .description("The IQuly CLI helps you build Agents right from the terminal.")
    .version("0.1.2")
    .showSuggestionAfterError()
    .showHelpAfterError("(run `iquly --help` for usage)");
program.addHelpText("after", `
Examples:
  iquly login
  iquly init my-agent --description "Internal ops helper"
  iquly push . --dry-run
`);
program
    .command("login")
    .summary("Log in with the browser device flow")
    .action(async (options) => {
    await runLogin(options);
});
program
    .command("logout")
    .summary("Remove stored IQuly credentials")
    .action(async () => {
    await runLogout();
});
program
    .command("whoami")
    .summary("Show the current authenticated account")
    .action(async () => {
    await runWhoAmI();
});
program
    .command("init")
    .summary("Create a new agent folder")
    .argument("[dir]", "target directory", ".")
    .option("-d, --description <text>", "agent description")
    .action(async (dir, options) => {
    await runInit(dir, options);
});
program
    .command("push")
    .summary("Validate and upload a private agent version")
    .argument("[dir]", "agent directory", ".")
    .option("--dry-run", "validate the agent without uploading")
    .action(async (dir, options) => {
    await runPush(dir, options);
});
try {
    if (process.argv.length <= 2) {
        program.outputHelp();
    }
    else {
        await program.parseAsync(process.argv);
    }
}
catch (error) {
    if (error instanceof Error) {
        console.error(error.message);
    }
    else {
        console.error("Unknown CLI error");
    }
    process.exitCode = 1;
}
