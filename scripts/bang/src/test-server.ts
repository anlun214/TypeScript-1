import { readFileSync, writeFileSync } from "fs";

import ts = require("../../../built/local/tsserverlibrary");

import { Change, ChangerOld, C3, C4, C5, C6 } from "./utils";
import parseLog from "./parseLog";

const logLocation = "/home/andy/Downloads/tsserver.log"; //"C:/Users/anhans/Downloads/tsserver.log"; //

class DumbSession extends ts.server.Session {
	constructor() {
		const noop = () => {};
		const notImplemented = (): never => { throw new Error(); }
		const host: ts.server.ServerHost = {
			args: [],
			newLine: "\n",
			useCaseSensitiveFileNames: true,
			write(s): void {
				console.log(s);
				if (s.includes('"success":false')) {
					//console.log(s);
					throw new Error(s);
				}
			},
			readFile: notImplemented,
			writeFile: noop,
			resolvePath: notImplemented,
			fileExists: () => false,
			directoryExists: () => false,
			getDirectories: () => [],
			createDirectory: noop,
			getExecutingFilePath: () => "",
			getCurrentDirectory: () => "",
			//getEnvironmentVariable: () => "",
			readDirectory: () => [],
			exit: noop,
			setTimeout: () => 0,
			clearTimeout: noop,
			setImmediate: () => 0,
			clearImmediate: noop,
			createHash: s => `hash_${s}`,
			//TODO: https://github.com/Microsoft/TypeScript/issues/16776
			watchFile: () => {
				return { close() {} };
			},
			watchDirectory: () => {
				return { close() {} };
			},
		};
		/*const host: ts.server.ServerHost = {
			...ts.sys, //TODO: replace readFile with a shim
			setTimeout(): never { throw new Error(); },
			clearTimeout(): never { throw new Error(); },
			setImmediate(): never { throw new Error(); },
			clearImmediate(): never { throw new Error(); },
			//gc, trace, require
		};*/
		const cancellationToken: ts.server.ServerCancellationToken = {
			isCancellationRequested: () => false,
			setRequest() {},
			resetRequest() {},
		}
		const typingsInstaller: ts.server.ITypingsInstaller = {
			enqueueInstallTypingsRequest() {},
			attach() {},
			onProjectClosed() {},
			globalTypingsCacheLocation: "",
		};
		const logger: ts.server.Logger = {
			close() {},
			hasLevel: () => false,
			loggingEnabled: () => false,
			perftrc() {},
			info() {},
			startGroup() {},
			endGroup() {},
			msg() {},
			getLogFileName(): never { throw new Error(); },
		};
		const options: ts.server.SessionOptions = {
			host,
			cancellationToken,
			useSingleInferredProject: true,
			typingsInstaller,
			byteLength: s => Buffer.byteLength(s),
			hrtime(): never { throw new Error(); },
			logger,
			canUseEvents: false,
			//eventHandler: notImplemented,
			//throttleWaitMilliseconds: 0,
		};
		super(options);
	}
}

function getRequestsFromLog() {
	const log = readFileSync(logLocation, "utf-8");
	const events = parseLog(log);
	const requests = events.filter(e => e.type === "request").map(r => JSON.parse(r.text));

	//Doesn't look like these are important.
	//const x = events.filter(e => e.type === "event").map(e => JSON.parse(e.text));

	return requests.filter((r: any) => {
		const text = JSON.stringify(r);
		if (!text.includes("Cookie.ts"))
			return false;
		//No error if I exclude these events...
		//if (text.includes(`"insertString":""`))
		//    return false;

		switch (r.command) {
			case "signatureHelp":
			case "geterr":
			case "navtree":
			case "getSupportedCodeFixes":
			case "getCodeFixes":
			case "formatonkey":
			case "completionEntryDetails":
			case "quickinfo":
			case "occurrences":
			case "definition":
			case "references":
				return false;
			case "completions":
			case "configure":
			case "change":
			case "open":
			case "close":
			case "compilerOptionsForInferredProjects":
				//if (r.arguments.file && r.arguments.file !== "/Users/asvetl/work/applications/frontend/node_modules/@types/cookie/index.d.ts")
				//    return false;
				return true;
			default:
				throw new Error(r.command);
		}
	});
}

const requests = JSON.parse(readFileSync("./requests.json", "utf-8"));
//const requests = getRequestsFromLog();
//writeFileSync("./requests.json", JSON.stringify(requests, undefined, 2));
//process.exit(0);

interface Changer {
	change(change: Change): void;
	getText(): void;
}


function testChanges(changer: Changer) {
	for (const rq of requests) {
		switch (rq.command) {
			case "open":
				break; //ignore
			case "change":
				console.log(rq.arguments);
				const { line, offset, endLine, endOffset, insertString } = rq.arguments;
				changer.change({ line, offset, endLine, endOffset, insertString });
				break;
			case "completions":
				changer.getText();
				break;
			default:
				throw new Error(rq.command);
		}
	}
}

function testFake() {
	const c2 = new C6();
	testChanges(c2);
}

function test2() {
	const c = new C6();
	c.change({ line: 1, offset: 1, endLine: 1, endOffset: 1, insertString: "\n" });
	c.change({ line: 2, offset: 1, endLine: 2, endOffset: 1, insertString: "e" });
	c.change({ line: 2, offset: 2, endLine: 2, endOffset: 2, insertString: "x" });
}

function testSession() {
	const sess = new DumbSession();

	sess.onMessage(JSON.stringify({
		"command": "open",
		"arguments": {
			file: "/a.ts",
			fileContent: "",
			scriptKindName: "TS",
			projectRootPath: "/Users/asvetl/work/applications/frontend"
		}
	}));

	const sessionChanger: Changer = {
		change(change) {
			const args = { ...change, file: "/a.ts" };
			sess.onMessage(JSON.stringify({ command: "change", arguments: args }));
		},
		getText() {
			const args = {
			  file: "/a.ts",
			  line: 1,
			  offset: 1
			};
			sess.onMessage(JSON.stringify({ command: "completions", arguments: args }));
		}
	}
	testChanges(sessionChanger);

	/*
	try {
		for (const rq of requests) {
			//console.log("SEND: ", JSON.stringify(rq));
			sess.onMessage(JSON.stringify(rq));
		}
		console.log("NO ERROR");
	} catch (_e) {
		const e: Error = _e;
		const isCorrect = e.message.includes("charCount");
		console.log(isCorrect ? "Caught the correct error!" : "BOO");

		const j = JSON.parse(e.message.split('\n')[2]);
		console.log(j.message);
	}

	process.exit(0); //Else server will leave it open
	*/
}

//ts.server.ScriptVersionCache.maxVersions = 999999;
//ts.server.ScriptVersionCache.changeNumberThreshold = Number.MAX_SAFE_INTEGER;
//ts.server.ScriptVersionCache.changeLengthThreshold = Number.MAX_SAFE_INTEGER;
//testSession();

//testFake();

test2();


/*
TypeError: Cannot read property 'charCount' of undefined
	at LineNode.walk (/home/andy/TypeScript/built/local/scriptVersionCache.ts:702:39)
	at LineIndex.walk (/home/andy/TypeScript/built/local/scriptVersionCache.ts:484:23)
	at LineIndex.getText (/home/andy/TypeScript/built/local/scriptVersionCache.ts:490:22)
	at LineIndexSnapshot.getText (/home/andy/TypeScript/built/local/scriptVersionCache.ts:404:31)
	at Object.updateLanguageServiceSourceFile (/home/andy/TypeScript/built/services/services.ts:980:60)
	at acquireOrUpdateDocument (/home/andy/TypeScript/built/services/documentRegistry.ts:193:40)
	at Object.updateDocumentWithKey (/home/andy/TypeScript/built/services/documentRegistry.ts:160:20)
	at Object.getOrCreateSourceFileByPath [as getSourceFileByPath] (/home/andy/TypeScript/built/services/services.ts:1265:49)
	at tryReuseStructureFromOldProgram (/home/andy/TypeScript/built/compiler/program.ts:771:28)
	at Object.createProgram (/home/andy/TypeScript/built/compiler/program.ts:480:36)
*/
