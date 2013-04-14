// ensure that new ace style gets loaded
$('style#ace_editor').remove();
$('style#incremental-search-highlight-style-patch').remove();
$('style#incremental-search-highlighting').remove();
$('style#incremental-occur-highlighting').remove();

module('lively.ide.CodeEditor').requires('lively.morphic.TextCore', 'lively.morphic.Widgets', 'lively.persistence.BuildSpec', 'lively.ide.BrowserFramework').requiresLib({url: Config.codeBase + (false && lively.useMinifiedLibs ? 'lib/ace/lively-ace.min.js' : 'lib/ace/lively-ace.js'), loadTest: function() { return typeof ace !== 'undefined';}}).toRun(function() {

(function configureAce() {
    ace.config.set("workerPath", URL.codeBase.withFilename('lib/ace/').fullPath());
})();

lively.ide.ace = {

    modules: function(optPrefix, shorten) {
        // return ace modules, optionally filtered by optPrefix. If shorten is
        // true remove optPrefix from name
        var moduleNames = Object.keys(ace.define.modules);
        if (!optPrefix) return moduleNames;
        moduleNames = moduleNames.select(function(ea) {
            return ea.startsWith(optPrefix); });
        if (!shorten) return moduleNames;
        return moduleNames.map(function(ea) {
            return ea.substring(optPrefix.length); })
    },

    // currently supported:
    // "abap", "clojure", "coffee", "css", "dart", "diff", "haml", "html",
    // "jade", "java", "javascript", "json", "latex", "less", "lisp",
    // "makefile", "markdown", "objectivec", "python", "r", "rdoc", "sh",
    // "sql", "svg", "text", "xml"
    // available but not loaded by default are:
    // "asciidoc", "c9search", "c_cpp", "coldfusion", "csharp", "curly",
    // "dot", "glsl", "golang", "groovy", "haxe", "jsp", "jsx", "liquid",
    // "lua", "luapage", "lucene", "ocaml", "perl", "pgsql", "php",
    // "powershell", "rhtml", "ruby", "scad", "scala", "scss", "stylus",
    // "tcl", "tex", "textile", "typescript", "vbscript", "xquery", "yaml"

    availableTextModes: function() {
        return lively.ide.ace.modules('ace/mode/', false)
            .select(function(moduleName) { return !!ace.require(moduleName).Mode })
            .map(function(name) { return name.substring('ace/mode/'.length); });
    },

    moduleNameForTextMode: function(textModeName) {
        return this.availableTextModes().include(textModeName) ?
            'ace/mode/' + textModeName : null;
    },

    // supported:
    // "ambiance", "monokai", "chrome", "pastel_on_dark", "textmate",
    // "solarized_dark", "twilight", "tomorrow", "tomorrow_night",
    // "tomorrow_night_blue", "tomorrow_night_bright", "eclipse"
    // not loaded by default are:
    // "xcode", "vibrant_ink", "tomorrow_night_eighties",
    // "tomorrow_night_bright", "tomorrow_night_blue", "solarized_light",
    // "mono_industrial", "merbivore_soft", "merbivore", "kr", "idle_fingers",
    // "github", "dreamweaver", "dawn", "crimson_editor", "cobalt",
    // "clouds_midnight", "clouds", "chaos"
    availableThemes: function() { return this.modules('ace/theme/', true) },

    moduleNameForTheme: function(themeName) {
        return this.availableThemes().include(themeName) ?
            "ace/theme/" + themeName : null
    }
}

lively.morphic.Shapes.External.subclass("lively.morphic.CodeEditorShape",
'settings', {
    // for now we do have a couple of optimizations in place that need the
    // shape to reference the aceEditor
    doNotSerialize: ["aceEditor"]
},
'intializing', {
    initialize: function($super) {
        var node = document.createElement('div');
        $super(node);
    }
},
'serialization', {

    onstore: function() {
        this.extent = this.getExtent();
    },

    onrestore: function() {
        this.shapeNode = document.createElement('div');
        lively.bindings.connect(this, 'aceEditor', this, 'setExtent', {
            removeAfterUpdate: true,
            converter: function(ed) { return this.targetObj.extent; }
        });
    }
},
'HTML rendering', {
    getExtentHTML: function($super, ctx) {
        if (!this.aceEditor) return $super(ctx);
        var borderW = this.getBorderWidth(),
            aceSize = this.aceEditor.renderer.$size;
        return lively.pt(aceSize.width + borderW, aceSize.height + borderW);
    },

    setExtentHTML: function (ctx, value) {
        if (!ctx.shapeNode) return undefined;
        var borderWidth = Math.floor(this.getBorderWidth()),
            realExtent = value.subXY(borderWidth, borderWidth).maxPt(lively.pt(0,0));
        ctx.domInterface.setExtent(ctx.shapeNode, realExtent);
        if (this.aceEditor) this.aceEditor.resize(true);
        return realExtent;
    }
});


lively.morphic.Morph.subclass('lively.morphic.CodeEditor',
'settings', {
    style: {
        enableGrabbing: false,
        fontSize: Config.get('defaultCodeFontSize'),
        gutter: Config.get('aceDefaultShowGutter'),
        textMode: Config.get('aceDefaultTextMode'),
        theme: Config.get('aceDefaultTheme'),
        lineWrapping: Config.get('aceDefaultLineWrapping'),
        invisibles: Config.get('aceDefaultShowInvisibles'),
        printMargin: Config.get('aceDefaultShowPrintMargin'),
        showIndents: Config.get('aceDefaultShowIndents')
    },
    doNotSerialize: ['aceEditor', 'aceEditorAfterSetupCallbacks', 'savedTextString'],
    evalEnabled: true,
    isAceEditor: true
},
'initializing', {
    initialize: function($super, bounds, stringOrOptions) {
        var options = Object.isString(stringOrOptions) ?
                        {content: stringOrOptions} :
                        (stringOrOptions || {});
        $super(this.defaultShape());
        bounds = bounds || lively.rect(0,0,400,300);
        this.setBounds(bounds);
        this.textString = options.content || '';
        if (options.theme) this.setTheme(options.theme);
        if (options.textMode) this.setTextMode(options.textMode);
    },

    defaultShape: function() {
        return new lively.morphic.CodeEditorShape();
    },

    onOwnerChanged: function(newOwner) {
        if (newOwner) this.initializeAce(true);
    }
},
'styling', {
    applyStyle: function ($super, spec) {
        if (!spec) return this;
        $super(spec);
        if (spec.allowInput !== undefined) this.setInputAllowed(spec.allowInput);
        if (spec.fontFamily !== undefined) this.setFontFamily(spec.fontFamily);
        if (spec.fontSize !== undefined) this.setFontSize(spec.fontSize);
        if (spec.textColor !== undefined) this.setTextColor(spec.textColor);
        // -----------
        if (spec.gutter !== undefined) this.setShowGutter(spec.gutter);
        if (spec.textMode !== undefined) this.setTextMode(spec.textMode);
        if (spec.theme !== undefined) this.setTheme(spec.theme);
        if (spec.lineWrapping !== undefined) this.setLineWrapping(spec.lineWrapping);
        if (spec.invisibles !== undefined) this.setShowInvisibles(spec.invisibles);
        if (spec.printMargin !== undefined) this.setShowPrintMargin(spec.printMargin);
        if (spec.showIndents !== undefined) this.setShowIndents(spec.showIndents);
        return this;
    }
},
'serialization', {
    onLoad: function() {
        this.initializeAce();
    },

    onstore: function($super, persistentCopy) {
        $super(persistentCopy);
        persistentCopy.storedTextString = this.textString;
    },

    onrestore: function($super) {
        $super();
        if (this.storedTextString) {
            this.textString = this.storedTextString;
            delete this.storedTextString;
        }
    }
},
'accessing', {
    getGrabShadow: function() { return null; }
},
'ace', {
    initializeAce: function(force) {
        // 1) create ace editor object
        if (this.aceEditor && !force) return;
        var node = this.getShape().shapeNode,
            e = this.aceEditor = this.aceEditor || ace.edit(node),
            morph = this;
        e.on('focus', function() { morph._isFocused = true; });
        e.on('blur', function() { morph._isFocused = false; });
        node.setAttribute('id', 'ace-editor');
        e.session.setUseSoftTabs(Config.get("useSoftTabs"));

        // 2) let the shape know about the editor, this let's us do some optimizations
        this.getShape().aceEditor = e;

        // 3) set modes / themes
        this.setStyleSheet('#ace-editor {'
                          + ' position:absolute;'
                          + ' top:0; bottom:0; left:0; right:0;'
                          + '}');
        this.setupKeyBindings();
        this.setTextMode(this.getTextMode() || "");
        this.setTheme(this.getTheme() || '');
        this.setFontSize(this.getFontSize());
        this.setShowGutter(this.getShowGutter());
        this.setLineWrapping(this.getLineWrapping());
        this.setShowPrintMargin(this.getShowPrintMargin());
        this.setShowInvisibles(this.getShowInvisibles());
        this.setShowIndents(this.getShowIndents());
        this._StyleClassNames = this.jQuery().attr('class').split(' ');

        // 4) run after setup callbacks
        var cbs = this.aceEditorAfterSetupCallbacks;
        if (!cbs) return;
        delete this.aceEditorAfterSetupCallbacks;
        cbs.invoke('call', this, e);
    },

    addCommands: function(commands) {
        var e = this.aceEditor,
            handler = e.commands,
            platform = handler.platform; // mac or win

        function lookupCommand(keySpec) {
            return keySpec.split('|').detect(function(keys) {
                var binding = e.commands.parseKeys(keys),
                    command = e.commands.findKeyCommand(binding.hashId, binding.key);
                return command && command.name;
            });
        }

        // first remove a keybinding if one already exists
        commands.forEach(function(cmd) {
            var keys = cmd.bindKey && (cmd.bindKey[platform] || cmd.bindKey),
                existing = keys && lookupCommand(keys);
            if (existing) handler.removeCommand(existing);
        });
        handler.addCommands(commands);
    },

    setupKeyBindings: function() {
        var codeEditor = this;
        this.addCommands([
            { // evaluation
                name: 'doit',
                bindKey: {win: 'Ctrl-D',  mac: 'Command-D'},
                exec: this.doit.bind(this, false),
                multiSelectAction: "forEach",
                readOnly: false // false if this command should not apply in readOnly mode
            }, {
                name: 'printit',
                bindKey: {win: 'Ctrl-P',  mac: 'Command-P'},
                exec: this.doit.bind(this, true),
                multiSelectAction: "forEach",
                readOnly: false
            }, {
                name: 'list protocol',
                bindKey: {win: 'Ctrl-Shift-P',  mac: 'Command-Shift-P'},
                exec: this.doListProtocol.bind(this),
                multiSelectAction: "single",
                readOnly: false
            }, {
                name: 'doSave',
                bindKey: {win: 'Ctrl-S',  mac: 'Command-S'},
                exec: this.doSave.bind(this),
                multiSelectAction: "single",
                readOnly: false
            }, {
                name: 'printInspect',
                bindKey: {win: 'Ctrl-I',  mac: 'Command-I'},
                exec: this.printInspect.bind(this),
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: 'doInspect',
                bindKey: {win: 'Ctrl-Shift-I',  mac: 'Command-Shift-I'},
                exec: this.doInspect.bind(this),
                multiSelectAction: "forEach",
                readOnly: true
            }, { // text manipulation
                name: 'removeSelectionOrLine',
                bindKey: {win: 'Ctrl-X', mac: 'Command-X'},
                exec: function(ed) {
                    var sel = ed.selection;
                    if (sel.isEmpty()) { sel.selectLine(); }
                    // let a normal "cut" to the clipboard happen
                    return false;
                },
                multiSelectAction: function(ed) {
                    var sel = ed.selection;
                    // for all cursors: if range is empty select line
                    sel.getAllRanges().forEach(function(range) {
                        if (!range.isEmpty())  return;
                        var row = range.start.row,
                            lineRange = sel.getLineRange(row, true);
                        sel.addRange(lineRange);
                    });
                    // let a normal "cut" to the clipboard happen
                    ed.execCommand('cut');
                    return false;
                },
                readOnly: false
            },
            // code manipulation
            {
                name: "blockoutdent",
                bindKey: {win: "Ctrl-[", mac: "Command-["},
                exec: function(editor) { editor.blockOutdent(); },
                multiSelectAction: "forEach"
            }, {
                name: "blockindent",
                bindKey: {win: "Ctrl-]", mac: "Command-]"},
                exec: function(editor) { editor.blockIndent(); },
                multiSelectAction: "forEach"
            },{ // selection / movement
                name: 'clearSelection',
                bindKey: 'Escape',
                exec: this.clearSelection.bind(this),
                readOnly: true
            }, {
                name: 'selectLine',
                bindKey: {win: "Ctrl-L", mac: "Command-L"},
                exec: this.selectCurrentLine.bind(this),
                multiSelectAction: 'forEach',
                readOnly: true
            }, {
                name: 'moveForwardToMatching',
                bindKey: {win: 'Ctrl-Right',  mac: 'Command-Right'},
                exec: this.moveForwardToMatching.bind(this, false),
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: 'moveBackwardToMatching',
                bindKey: {win: 'Ctrl-Left',  mac: 'Command-Left'},
                exec: this.moveBackwardToMatching.bind(this, false),
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: 'selectToMatchingForward',
                bindKey: {win: 'Ctrl-Shift-Right',  mac: 'Command-Shift-Right'},
                exec: this.moveForwardToMatching.bind(this, true),
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: 'selectToMatchingBackward',
                bindKey: {win: 'Ctrl-Shift-Left',  mac: 'Command-Shift-Left'},
                exec: this.moveBackwardToMatching.bind(this, true),
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: "selecttolinestart",
                bindKey: 'Shift-Home|Ctrl-Shift-A',
                exec: function(editor) { editor.getSelection().selectLineStart(); },
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: "gotolinestart",
                bindKey: {win: "Home", mac: "Home|Ctrl-A"},
                exec: function(editor) { editor.navigateLineStart(); },
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: "selecttolineend",
                bindKey: "Shift-End|Ctrl-Shift-E",
                exec: function(editor) { editor.getSelection().selectLineEnd(); },
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: "gotolineend",
                bindKey: "End|Ctrl-E",
                exec: function(editor) { editor.navigateLineEnd(); },
                multiSelectAction: "forEach",
                readOnly: true
            },
            // search & find
            {
                name: "searchWithPrompt",
                bindKey: {win: "Ctrl-F", mac: "Command-F"},
                exec: this.searchWithPrompt.bind(this),
                readOnly: true
            }, {
                name: "findnext",
                bindKey: {win: "Ctrl-K", mac: "Command-G"},
                exec: this.findNext.bind(this),
                readOnly: true
            }, {
                name: "findprevious",
                bindKey: {win: "Ctrl-Shift-K", mac: "Command-Shift-G"},
                exec: this.findPrev.bind(this),
                readOnly: true
            }, {
                name: "multiSelectNext",
                bindKey: "Ctrl-Shift-.",
                exec: this.multiSelectNext.bind(this),
                readOnly: true
            }, {
                name: "multiSelectPrev",
                bindKey: "Ctrl-Shift-,",
                exec: this.multiSelectPrev.bind(this),
                readOnly: true
            }, {
                name: 'doBrowseImplementors',
                bindKey: {win: 'Ctrl-Shift-F', mac: 'Command-Shift-F'},
                exec: this.doBrowseImplementors.bind(this),
                readOnly: true
            },
            // insertion
            {
                name: 'insertLineAbove',
                bindKey: "Shift-Return",
                exec: function(ed) { ed.navigateUp(); ed.navigateLineEnd(); ed.insert('\n'); },
                multiSelectAction: 'forEach',
                readOnly: false
            }, {
                name: 'insertLineBelow',
                bindKey: "Command-Return",
                exec: function(ed) { ed.navigateLineEnd(); ed.insert('\n'); },
                multiSelectAction: 'forEach',
                readOnly: false
            },
            // editor settings
            {
                name: 'increasefontsize',
                bindKey: {win: "Ctrl-»", mac: "Command-»"},
                exec: function(ed) { codeEditor.setFontSize(codeEditor.getFontSize() + 1); },
                readOnly: true
            }, {
                name: 'decreasefontsize',
                bindKey: {win: "Ctrl-½", mac: "Command-½"},
                exec: function(ed) { codeEditor.setFontSize(codeEditor.getFontSize() - 1); },
                readOnly: true
            },
            // command line
            {
                name: 'linebreak',
                exec: function(ed) { cmdLine.insert("\n"); }
            }, {
                name: 'entercommand',
                exec: function(ed) {
                    if (codeEditor.commandLineInput) {
                        codeEditor.commandLineInput(ed.getValue);
                    } else {
                        lively.morphic.show('CommandLine should implement #commandLineInput');
                    }
                }
            }]);

        if (Object.isFunction(Config.codeEditorUserKeySetup)) {
            Config.codeEditorUserKeySetup(this);
            // update existing editors when #codeEditorUserKeySetup changes:
            lively.bindings.connect(Config, 'codeEditorUserKeySetup', this, 'setupKeyBindings',
                {forceAttributeConnection: true});
        }
    },

    lookupCommand: function(keySpec) {
        return this.withAceDo(function(ed) {
            var handler = ed.commands,
                binding = handler.parseKeys(keySpec),
                command = handler.findKeyCommand(binding.hashId, binding.key);
            if (!command) return null;
            if (!command.hasOwnProperty('toString')) {
                command.toString = function() { return '[cmd:' + command.name + ']' }
            }
            return command;
        });
    },

    withAceDo: function(doFunc) {
        if (this.aceEditor) return doFunc.call(this, this.aceEditor);
        if (!this.aceEditorAfterSetupCallbacks) this.aceEditorAfterSetupCallbacks = [];
        this.aceEditorAfterSetupCallbacks.push(doFunc);
        return undefined;
    },

    loadAceModule: function(moduleName, callback) {
        return ace.require('./config').loadModule(moduleName, callback);
    },

    indexToPosition: function(absPos) {
        return this.withAceDo(function(ed) { return ed.session.doc.indexToPosition(absPos); });
    }

},
'ace interface', {
    setCursorPosition: function(pos) {
        return this.withAceDo(function(ed) {
            ed.selection.moveCursorToPosition({column: pos.x, row: pos.y}); });
    },

    getCursorPosition: function() {
        return this.withAceDo(function(ed) {
            var pos = ed.getCursorPosition();
            return lively.pt(pos.column, pos.row); });
    },

    moveToMatching: function(forward, shouldSelect, moveAnyway) {
        // This method tries to find a matching char to the one the cursor
        // currently points at. If a match is found it is set as the new
        // position. In case there is no match but moveAnyway is truthy try to
        // move forward over words. A selection range is created when
        // shouldSelect is truthy.
        return this.withAceDo(function(ed) {
            var pos = ed.getCursorPosition(),
                range = ed.session.getBracketRange(pos),
                sel = ed.selection;
            if (!range
              || (forward && !range.isStart(pos.row, pos.column))
              || (!forward && !range.isEnd(pos.row, pos.column))) {
                if (!moveAnyway) return;
                var method = (shouldSelect ? "selectWord" : "moveCursorWord")
                           + (forward ? "Right" : "Left");
                sel[method]();
            } else {
                var to = forward ? range.end : range.start;
                if (!shouldSelect) {
                    sel.moveCursorToPosition(to);
                } else {
                    sel.selectToPosition(to);
                }
            }
        });
    },

    getCurrentSearchTerm: function() {
        return this.withAceDo(function(ed) {
            return ed.$search
                && ed.$search.$options
                && ed.$search.$options.needle;
        }) || '';
    },

    moveForwardToMatching: function(shouldSelect, moveAnyway) {
        this.moveToMatching(true, shouldSelect, moveAnyway);
    },

    moveBackwardToMatching: function(shouldSelect, moveAnyway) {
        this.moveToMatching(false, shouldSelect, moveAnyway);
    },

    clearSelection: function() { this.withAceDo(function(ed) { ed.clearSelection(); }) },

    setTheme: function(themeName) {
        this.withAceDo(function(ed) {
            ed.setTheme(lively.ide.ace.moduleNameForTheme(themeName));
        });
        return this._Theme = themeName;
    },

    getTheme: function() {
        if (this._Theme) return this._Theme;
        return this.withAceDo(function(ed) {
            var theme = ed.getTheme() || '';
            return theme.replace('ace/theme/', '');
        }) || '';
    },

    setTextMode: function(modeName) {
        this.withAceDo(function(ed) {
            ed.session.setMode(lively.ide.ace.moduleNameForTextMode(modeName));
        });
        return this._TextMode = modeName;
    },

    getTextMode: function() {
        if (this._TextMode) return this._TextMode;
        return this.withAceDo(function(ed) {
            var mode = ed.session.getMode(),
                name = mode && mode.$id ? mode.$id : 'text';
            return name.replace('ace/mode/', '');
        }) || 'text';
    }

},
'search and find', {

    searchWithPrompt: function() {
        var world = this.world();
        if (!world) return;
        this.withAceDo(function(ed) {
            world.prompt('Enter text or regexp to search for.', function(input) {
                if (!input) { ed.focus(); return };
                var regexpMatch = input.match(/^\/(.*)\/$/),
                    needle = regexpMatch && regexpMatch[1] ? new RegExp(regexpMatch[1], "") : input;
                ed.focus();
                ed.find({
                    needle: needle,
                    preventScroll: false,
                    skipCurrent: true,
                    start: ed.getCursorPosition(),
                    wrap: false,
                    animate: true
                });
            }, this.getCurrentSearchTerm());
        });
    },

    findNext: function() {
        this.withAceDo(function(ed) {
            ed.find({skipCurrent: true, backwards: false, needle: ed.$search.$options.needle});
        });
    },

    findPrev: function() {
        this.withAceDo(function(ed) {
            ed.find({skipCurrent: true, backwards: true, needle: ed.$search.$options.needle});
        });
    },

    doBrowseImplementors: function(ed) {
        this.world().openMethodFinderFor(this.getSelectionOrLineString());
    }

},
'event handling', {
    onMouseDown: function($super, evt) {
        // ace installs a mouseup event handler on the document level and
        // stops the event so it never reaches our Morphic event handlers. To
        // still dispatch the event properly we install an additional mouseup
        // handler that is removed immediately thereafter
        var self = this;
        function upHandler(evt) {
            document.removeEventListener("mouseup", upHandler, true);
            lively.morphic.EventHandler.prototype.patchEvent(evt);
            self.onMouseUpEntry(evt);
        }
        document.addEventListener("mouseup", upHandler, true);
        return $super(evt);
    },

    isScrollable: function() { return true; },

    stopScrollWhenBordersAreReached: function(evt) {
        // because of how ace scrolls internally these works a bit different to
        // the morphic #stopScrollWhenBordersAreReached
        if (!this.isScrollable() || this.isInInactiveWindow()) return false;
        var ed = this.aceEditor,
            renderer = ed.renderer;
        if (evt.wheelDeltaX) {/*...*/}
        if (evt.wheelDeltaY) {
            if (evt.wheelDeltaY > 0 && renderer.getFirstFullyVisibleRow() === 0) {
                evt.stop();
                return true;
            }
            var lineCount = ed.session.getScreenLength();
            if (evt.wheelDeltaY < 0 && renderer.getLastFullyVisibleRow() >= (lineCount-1)) {
                evt.stop();
                return true;
            }
        }
        return true;
    },

},
'text morph eval interface', {

    tryBoundEval: function(string) {
        try {
            return this.boundEval(string);
        } catch(e) {
            return e;
        }
    },

    boundEval: function (str) {
        // Evaluate the string argument in a context in which "this" may be supplied by the modelPlug
        var ctx = this.getDoitContext() || this,
            interactiveEval = function(text) { return eval(text) };
        return interactiveEval.call(ctx, str);
    },

    evalSelection: function(printIt) {
        var str = this.getSelectionOrLineString(),
            result = this.tryBoundEval(str);
        if (printIt) this.insertAtCursor(String(result), true);
        return result;
    },

    evalAll: function() {
        return this.tryBoundEval(this.textString);
    },

    printObject: function(editor, obj) {
        var sel = editor.selection;
        sel && sel.clearSelection();
        var start = sel && sel.getCursor();
        editor.onPaste(String(obj));
        var end = start && sel.getCursor();
        if (start && end) {
            sel.moveCursorToPosition(start);
            sel.selectToPosition(end);
        }
    },

    doit: function(printResult, editor) {
        var text = this.getSelectionOrLineString(),
            result = this.tryBoundEval(text);
        if (printResult) {
            this.printObject(editor, result);
            return;
        }
        var sel = editor.selection;
        if (sel && sel.isEmpty()) {
            sel.selectLine();
        }
    },

    doListProtocol: function() {
        var pl = new lively.morphic.Text.ProtocolLister(this);
        // FIXME
        pl.createSubMenuItemFromSignature = function(signature, optStartLetters) {
            var textMorph = this.textMorph, replacer = signature;
            if (typeof(optStartLetters) !== 'undefined') {
                replacer = signature.substring(optStartLetters.size());
            }
            return [signature, function() {
                textMorph.focus();
                textMorph.clearSelection();
                textMorph.insertAtCursor(replacer, true);
            }];
        }
        pl.evalSelectionAndOpenListForProtocol();
    },

    doInspect: function() {
        var obj = this.evalSelection();
        if (obj) lively.morphic.inspect(obj);
    },
    printInspectMaxDepth: 2,


    printInspect: function() {
        this.withAceDo(function(ed) {
            var obj = this.evalSelection();
            this.printObject(ed, Objects.inspect(obj, {maxDepth: this.printInspectMaxDepth}));
        });
    },

    getDoitContext: function() { return this.doitContext || this; }

},
'text morph save content interface', {
    hasUnsavedChanges: function() {
        // return this.savedTextString !== this.textString;
        return false;
    }
},
'text morph event interface', {
    focus: function() { this.aceEditor.focus(); },
    isFocused: function() { return this._isFocused; },
    requestKeyboardFocus: function(hand) { this.focus(); },
    onWindowGetsFocus: function(window) { this.focus(); }
},
'text morph selection interface', {
    setSelectionRange: function(startIdx, endIdx) {
        this.withAceDo(function(ed) {
            var doc = ed.session.doc,
                start = doc.indexToPosition(startIdx),
                end = doc.indexToPosition(endIdx)
            ed.selection.setRange({start: start, end: end});
        });
    },

    getSelectionRange: function() {
        return this.withAceDo(function(ed) {
            var range = ed.selection.getRange(),
                doc = ed.session.doc;
            return [doc.positionToIndex(range.start), doc.positionToIndex(range.end)];
        });
    },

    selectAll: function() {
        this.withAceDo(function(ed) { ed.selectAll(); });
    },

    getSelectionOrLineString: function() {
        var editor = this.aceEditor, sel = editor.selection;
        if (!sel) return "";
        if (sel.isEmpty()) this.selectCurrentLine();
        var range =  editor.getSelectionRange();
        return editor.session.getTextRange(range);
    },
    selectCurrentLine: function() {
        this.withAceDo(function(ed) {
            var selStart = ed.selection.getSelectionAnchor();
            ed.navigateLineStart();
            var lineStartPos = ed.getCursorPosition();
            if (selStart.column === lineStartPos.column && selStart.row == lineStartPos.row) {
                // for switching between real line start and pos after spaces
                ed.navigateLineStart();
            }
            ed.selection.selectLineEnd();
        });
    },


    multiSelectNext: function() {
        this.multiSelect({backwards: false});
    },

    multiSelectPrev: function() {
        this.multiSelect({backwards: true});
    },

    multiSelect: function(options) {
        options = options || {};
        this.withAceDo(function(ed) {
            // if the text in the current selection matches the last search
            // use the last search string or regexp to add new selections.
            // Otherwise use the currently selected text as the new search
            // term
            var needle, lastSearch = this.getCurrentSearchTerm();
            if (!ed.selection.inMultiSelectMode && !ed.selection.isEmpty()) {
                var range = ed.selection.getRange();
                needle = ed.session.getTextRange(range);
            }
            if (!needle
              || needle === lastSearch
              || (Object.isRegExp(lastSearch) && lastSearch.test(needle))) {
                needle = lastSearch;
            }
            if (!needle) needle = '';
            var foundRange = ed.find({
                skipCurrent: true,
                backwards: options.backwards,
                needle: needle,
                preventScroll: true
            });
            ed.selection.addRange(foundRange);
        });
    }

},
'text morph syntax highlighter interface', {
    enableSyntaxHighlighting: function() { this.setTextMode('javascript'); },
    disableSyntaxHighlighting: function() { this.setTextMode('text'); }
},
'text morph interface', {

    set textString(string) {
        this.withAceDo(function(ed) {
            ed.selection.clearSelection();
            var pos = ed.getCursorPosition(),
                scroll = ed.session.getScrollTop();
            ed.session.doc.setValue(string);
            ed.selection.moveCursorToPosition(pos);
            ed.session.setScrollTop(scroll);
        });
        return string;
    },

    get textString() {
        return this.withAceDo(function(ed) {
            var doc = ed.getSession().getDocument();
            return doc.getValue();
        }) || "";
    },

    setTextString: function(string) { return this.textString = string; },

    getTextString: function(string) { return this.textString; },

    insertTextStringAt: function(indexOrPos, string) {
        this.withAceDo(function(ed) {
            var pos = indexOrPos;
            if (Object.isNumber(pos)) pos = this.indexToPosition(pos);
            if (!pos) pos = ed.getCursorPosition();
            ed.session.insert(pos, string);
        });
    },
    insertAtCursor: function(string, selectIt, overwriteSelection) {
        this.withAceDo(function(ed) { ed.onPaste(string) });
    },

    doSave: function() {
        this.savedTextString = this.textString;
        if (this.evalEnabled) {
            this.tryBoundEval(this.savedTextString);
        }
    },

    setFontSize: function(size) {
        this.withAceDo(function(ed) { ed.setOption("fontSize", size); });
        return this._FontSize = size;
    },

    getFontSize: function() {
        if (this._FontSize) return this._FontSize;
        return this.withAceDo(function(ed) { return ed.getOption("fontSize"); })
            || Config.get("defaultCodeFontSize");
    },

    setFontFamily: function(fontName) {
        this.getShape().shapeNode.style.fontFamily = fontName;
        return this._FontFamily = fontName;
    },

    getFontFamily: function() { return this._FontFamily; },

    inputAllowed: function() { return this.allowInput },
    setInputAllowed: function(bool) { throw new Error('implement me'); },

    enableGutter: function() { this.setShowGutter(true); },
    disableGutter: function() { this.setShowGutter(false); },
    setShowGutter: function(bool) {
        this.withAceDo(function(ed) { ed.renderer.setShowGutter(bool); });
        return this._ShowGutter = bool;
    },
    getShowGutter: function(bool) {
        if (this.hasOwnProperty('_ShowGutter')) return this._ShowGutter;
        return this.withAceDo(function(ed) { return ed.renderer.getShowGutter(); });
    },

    getLineWrapping: function() {
        return this._LineWrapping || this.withAceDo(function(ed) {
            return ed.session.getUseWrapMode(); });
    },
    setLineWrapping: function(bool) {
        this.withAceDo(function(ed) { ed.session.setUseWrapMode(bool); });
        return this._LineWrapping = bool;
    },

    setShowInvisibles: function(bool) {
        this.withAceDo(function(ed) { ed.setShowInvisibles(bool); });
        return this._ShowInvisibles = bool;
    },
    getShowInvisibles: function() {
        return this._ShowInvisibles || this.withAceDo(function(ed) {
            return ed.getShowInvisibles(); });
    },

    setShowPrintMargin: function(bool) {
        this.withAceDo(function(ed) { ed.setShowPrintMargin(bool); });
        return this._ShowPrintMargin = bool;
    },
    getShowPrintMargin: function() {
        return this._ShowPrintMargin || this.withAceDo(function(ed) {
            return ed.getShowPrintMargin(); });
    },

    setShowIndents: function(bool) {
        this.withAceDo(function(ed) { ed.setDisplayIndentGuides(bool); });
        return this._setShowIndents = bool;
    },
    getShowIndents: function() {
        return this._setShowIndents || this.withAceDo(function(ed) {
            return ed.getDisplayIndentGuides(); });
    }

},
'text morph replacement', {
    replaceTextMorph: function(oldEditor) {
        var newEditor = this;
        Functions.own(oldEditor).forEach(function(name) { newEditor.addScript(oldEditor[name]); })
        newEditor.name = oldEditor.name;
        oldEditor.owner.addMorph(newEditor);
        oldEditor.remove();
    }
},
'rendering', {
    setClipMode: Functions.Null
},
'morph menu', {
    morphMenuItems: function($super) {
        var items = $super(), editor = this;

        var currentTheme = this.getTheme(),
            themeItems = lively.ide.ace.availableThemes().map(function(theme) {
            var themeString = Strings.format('[%s] %s',
                                             theme === currentTheme ? 'X' : ' ',
                                             theme);
            return [themeString, function(evt) { editor.setTheme(theme); }]; });

        var currentTextMode = this.getTextMode(),
            modeItems = lively.ide.ace.availableTextModes().map(function(mode) {
                var modeString = Strings.format('[%s] %s',
                                                 mode === currentTextMode ? 'X' : ' ',
                                                 mode);
                return [modeString, function(evt) { editor.setTextMode(mode); }]; });

        items.push(["themes", themeItems]);
        items.push(["modes", modeItems]);

        var usesWrap = editor.getLineWrapping();
        items.push([Strings.format("[%s] line wrapping", usesWrap ? 'X' : ' '), function() {
            editor.setLineWrapping(!usesWrap); }]);

        return items;
    }
},
'messaging', {
    setStatusMessage: function (msg, color, delay) {
        console.log("%s status: %s", this, msg)
        var sm = this._statusMorph;
        if (!sm) {
            this._statusMorph = sm = new lively.morphic.Text(pt(400,80).extentAsRectangle());
            sm.applyStyle({
                borderWidth: 0, borderRadius: 2,
                fill: Color.gray.lighter(2),
                fontSize: this.getFontSize() + 1,
                fixedWidth: false, fixedHeight: false
            });
            sm.isEpiMorph = true;
            this._sm = sm;
        }
        sm.textString = msg;
        this.world().addMorph(sm);
        sm.setTextColor(color || Color.black);
        sm.ignoreEvents();
        sm.align(sm.bounds().bottomCenter(),
            this.worldPoint(this.innerBounds().bottomCenter()));
        (function() { sm.remove() }).delay(delay || 4);
    },

    showError: function (e, offset) {
        this.setStatusMessage(String(e), Color.red);
    }
});

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// command line support
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
lively.BuildSpec('lively.morphic.CommandLine', {
    name: "CommandLine",
    className: "lively.morphic.CodeEditor",
    style: {
        gutter: false,
        enableGrabbing: false,
        enableDragging: false,
        clipMode: 'hidden',
        fontSize: 12
    },
    // grabbingEnabled: false
    _Extent: pt(300, 18),
    initCommandLine: function initCommandLine(ed) {
        this.isCommandLine = true;
        ed.renderer.scrollBar.element.style.display = 'none';
        ed.renderer.scrollBar.width = 0;
        ed.resize(true);
    },
    onLoad: function onLoad() {
        $super();
        this.withAceDo(function(ed) { this.initCommandLine(ed); });
    },
    onFromBuildSpecCreated: function onFromBuildSpecCreated() {
        this.withAceDo(function(ed) { this.initCommandLine(ed); });
    }
});

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// use ace editor as workspace
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

lively.morphic.World.addMethods(
'tools', {
    addCodeEditor: function(options) {
        options = Object.isString(options) ? {content: options} : (options || {}); // convenience
        var bounds = (options.extent || lively.pt(500, 200)).extentAsRectangle(),
            title = options.title || 'Code editor',
            editor = new lively.morphic.CodeEditor(bounds, options.content || ''),
            pane = this.internalAddWindow(editor, options.title, options.position);;
        editor.applyStyle({resizeWidth: true, resizeHeight: true});
        editor.accessibleInInactiveWindow = true;
        if (options.theme) editor.setTheme(options.theme);
        if (options.textMode) editor.setTextMode(options.textMode);
        editor.focus();
        return pane;
    },

    openWorkspace: lively.morphic.World.prototype.openWorkspace.wrap(function($proceed, evt) {
        if (!Config.get('useAceEditor')) { return $proceed(evt); }
        var window = this.addCodeEditor({
            title: "Workspace",
            content: "nothing",
            syntaxHighlighting: !0,
            theme: Config.aceWorkspaceTheme
        });
        return window;
    }),

    openObjectEditor: lively.morphic.World.prototype.openObjectEditor.wrap(function($proceed) {
        var objectEditor = $proceed(),
            textMorph = objectEditor.get('ObjectEditorScriptPane');
        if (!Config.get('useAceEditor') || textMorph.isAceEditor) return objectEditor;
        // FIXME!!!
        objectEditor.withAllSubmorphsDo(function(ea) { ea.setScale(1) });
        // replace the normal text morph of the object editor with a
        // CodeEditor
        var owner = textMorph.owner,
            textString = textMorph.textString,
            bounds = textMorph.bounds(),
            name = textMorph.getName(),
            objectEditorPane = textMorph.objectEditorPane,
            scripts = textMorph.scripts,
            codeMorph = new lively.morphic.CodeEditor(bounds, textString || '');

        lively.bindings.connect(codeMorph, 'textString',
                                owner.get('ChangeIndicator'), 'indicateUnsavedChanges');
        codeMorph.setName(name);
        codeMorph.objectEditorPane = objectEditorPane;
        codeMorph.applyStyle({resizeWidth: true, resizeHeight: true});
        codeMorph.accessibleInInactiveWindow = true;

        Functions.own(textMorph).forEach(function(scriptName) {
            textMorph[scriptName].asScriptOf(codeMorph);
        });

        codeMorph.addScript(function displayStatus(msg, color, delay) {
            if (!this.statusMorph) {
                this.statusMorph = new lively.morphic.Text(pt(100,25).extentAsRectangle());
                this.statusMorph.applyStyle({borderWidth: 1, strokeOpacity: 0, borderColor: Color.gray});
                this.statusMorph.setFill(this.owner.getFill());
                this.statusMorph.setFontSize(11);
                this.statusMorph.setAlign('center');
                this.statusMorph.setVerticalAlign('center');
            }
            this.statusMorph.setTextString(msg);
            this.statusMorph.centerAt(this.innerBounds().center());
            this.statusMorph.setTextColor(color || Color.black);
            this.addMorph(this.statusMorph);
            (function() { this.statusMorph.remove() }).bind(this).delay(delay || 2);
        });

        objectEditor.targetMorph.addScript(function onWindowGetsFocus() {
            this.get('ObjectEditorScriptPane').focus();
        });

        owner.addMorphBack(codeMorph);
        lively.bindings.disconnectAll(textMorph);
        textMorph.remove();
        owner.reset();
        return objectEditor;
    }),

    openStyleEditorFor: function(morph, evt) {
        var editor = this.openPartItem('StyleEditor', 'PartsBin/Tools'),
            alignPos = morph.getGlobalTransform().transformPoint(morph.innerBounds().bottomLeft()),
            edBounds = editor.innerBounds(),
            visibleBounds = this.visibleBounds();
        if (visibleBounds.containsRect(edBounds.translatedBy(alignPos))) {
            editor.setPosition(alignPos);
        } else {
            editor.setPosition(this.positionForNewMorph(editor, morph));
        }
        editor.setTarget(morph);
        if (Config.get('useAceEditor')) {
            var oldEditor = editor.get("CSSCodePane"),
                newEditor = new lively.morphic.CodeEditor(oldEditor.bounds(), oldEditor.textString);
            newEditor.applyStyle({
                fontSize: Config.get('defaultCodeFontSize')-1,
                gutter: false,
                textMode: 'css',
                lineWrapping: false,
                printMargin: false,
                resizeWidth: true, resizeHeight: true
            });
            lively.bindings.connect(newEditor, "savedTextString", oldEditor.get("CSSApplyButton"), "onFire");
            newEditor.replaceTextMorph(oldEditor);
        }
        return editor;
    },

    openWorldCSSEditor: function () {
        var editor = this.openPartItem('WorldCSS', 'PartsBin/Tools');
        if (Config.get('useAceEditor')) {
            var oldEditor = editor.get("CSSCodePane"),
                newEditor = new lively.morphic.CodeEditor(oldEditor.bounds(), oldEditor.textString);
            newEditor.applyStyle({
                fontSize: Config.get('defaultCodeFontSize')-1,
                gutter: false,
                textMode: 'css',
                lineWrapping: false,
                printMargin: false,
                resizeWidth: true, resizeHeight: true
            });
            lively.bindings.connect(newEditor, "savedTextString", oldEditor.get("WorldCSS"), "applyWorldCSS", {});
            newEditor.replaceTextMorph(oldEditor);
        }
        return editor;
    },

    openPartItem: lively.morphic.World.prototype.openPartItem.getOriginal().wrap(function($proceed, name, partsbinCat) {
        var part = $proceed(name, partsbinCat);
        if (!Config.get('useAceEditor')) { return part; }
        if (name === 'MethodFinderPane' && partsbinCat === 'PartsBin/Dialogs') {
            var oldEditor = part.get("sourceText"),
                newEditor = new lively.morphic.CodeEditor(oldEditor.bounds(), oldEditor.textString);
            newEditor.applyStyle({
                resizeWidth: true, resizeHeight: true
            });
            newEditor.replaceTextMorph(oldEditor);
        }
        return part;
    }),

});


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// ace support for lively.ide
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

lively.morphic.CodeEditor.addMethods(
'deprecated interface', {
    innerMorph: function() { return this },
    showChangeClue: function() {},
    getVerticalScrollPosition: function() { },
    setVerticalScrollPosition: function(value) {}
},
'text compatibility', {
    emphasize: Functions.Null,
    emphasizeAll: Functions.Null,
    unEmphasizeAll: Functions.Null,
    emphasizeRegex: Functions.Null,
    emphasizeRange: Functions.Null,
    highlightJavaScriptSyntax: Functions.Null
});

Object.extend(lively.ide, {
    newCodeEditor: function (initialBounds, defaultText) {
        var bounds = initialBounds.extent().extentAsRectangle(),
            text = new lively.morphic.CodeEditor(bounds, defaultText || '');
        text.accessibleInInactiveWindow = true;
        return text;
    }
});

var origBrowserPanelSpec = lively.ide.BasicBrowser.prototype.panelSpec;

lively.morphic.WindowedApp.subclass('lively.ide.BasicBrowser',
'settings', {
    get panelSpec() {
        if (!Config.get('useAceEditor')) return origBrowserPanelSpec;
        return [
            ['locationPane', newTextPane,                                                        [0,    0,    0.8,  0.03]],
            ['codeBaseDirBtn', function(bnds) { return new lively.morphic.Button(bnds) },        [0.8,  0,    0.12, 0.03]],
            ['localDirBtn', function(bnds) { return new lively.morphic.Button(bnds) },           [0.92, 0,    0.08, 0.03]],
            ['Pane1', newDragnDropListPane,                                                      [0,    0.03, 0.25, 0.37]],
            ['Pane2', newDragnDropListPane,                                                      [0.25, 0.03, 0.25, 0.37]],
            ['Pane3', newDragnDropListPane,                                                      [0.5,  0.03, 0.25, 0.37]],
            ['Pane4', newDragnDropListPane,                                                      [0.75, 0.03, 0.25, 0.37]],
            ['midResizer', function(bnds) { return new lively.morphic.HorizontalDivider(bnds) }, [0,    0.44, 1,    0.01]],
            ['sourcePane', lively.ide.newCodeEditor,                                             [0,    0.45, 1,    0.54]]
        ]
    }
});


}); // end of module
