﻿/// <reference path="jquery.d.ts" />
/// <reference path="utilities/linq.ts" />


//TODO: At some point this file will need to be broken up. Right now ASP.NET 5 doesn't have the right tooling to merge typescript files, so it's a massive pain 
// in the ass. When (if?) the tooling is added, separate the file into logical blocks. 

module KMud {
    export class Game {
        private input: HTMLInputElement;
        private lastCommands: string[] = [];
        private currentCommand: number = -1;
        private messageHandlers: { [index: string]: Action1<MessageBase> } = {};
        private commandHandlers: { [index: string]: Action1<Tokenizer> } = {};
        private symbolCommandHandlers: { [index: string]: Action1<Tokenizer> } = {};
        private currentPlayer: ActorInformationMessage;
        private ding: HTMLAudioElement;
        private hasFocus: boolean = true;
        private lastDing = new Date(0);

        private get mainOutput(): HTMLElement {
            return document.getElementById("Output");
        }

        private notify() {
            // only ding if the window is out of focus, and it hasn't dinged in the last minute.
            if (!this.hasFocus) {
                var now = new Date();
                var diff = now.valueOf() - this.lastDing.valueOf();
                if (diff > 1000 * 60) {
                    this.lastDing = now;
                    this.ding.play();
                }
            }
        }

        constructor() {
            this.input = <HTMLInputElement>document.getElementById("InputBox");
            $("#InputBox").keypress(x => {
                if (x.keyCode == 13) {
                    if (this.input.value.trim() != "") {
                        this.addOutput(document.getElementById("Output"), this.input.value, "command-text");
                        this.lastCommands.unshift(this.input.value);
                        this.processCommand(this.input.value);
                        this.input.value = "";
                        this.currentCommand = -1;

                        while (this.lastCommands.length > 20) {
                            this.lastCommands.shift()
                        }
                    }
                    else {
                        // Hardcoded "brief look" command when user simply hits "enter".
                        this.look("", true);
                    }
                }
            }).keydown(x => {
                if (x.keyCode == 38 && x.ctrlKey) {
                    if (this.currentCommand < this.lastCommands.length - 1) {
                        this.currentCommand++;
                        this.input.value = this.lastCommands[this.currentCommand];
                    }
                }
                else if (x.keyCode == 40 && x.ctrlKey) {
                    if (this.currentCommand >= 1) {
                        this.currentCommand--;
                        this.input.value = this.lastCommands[this.currentCommand];
                    }
                    else if (this.currentCommand == 0) {
                        this.input.value = "";
                        this.currentCommand = -1;
                    }
                }

            });
            $(window).mouseup(x => {
                if (window.getSelection().toString().length == 0)
                    $("#InputBox").focus();
            });
            $(window).focus(evt => this.hasFocus = true);
            $(window).blur(evt => this.hasFocus = false);


            this.registerMessageHandlers();
            this.registerCommandHandlers();

            this.ding = new Audio("../media/ding.wav");
        }

        private processCommand(command: string) {
            var lower = command.toLocaleLowerCase().trim();

            var words = new Tokenizer(command);
            var param = words.token(0).substr(1);

            var handler = this.commandHandlers[words.token(0)];
            if (handler) {
                handler(words);
                return;
            }

            // Check for character commands; ie "/Mithrandir hey there"
            var char = words.token(0).substr(0, 1);
            var charHandler = this.symbolCommandHandlers[char]
            if (charHandler != null) {
                charHandler(words);
                return;
            }

            // No clue. Say it, don't spray it.
            this.talk(command, CommunicationType.Say);
        }

        private _socket: WebSocket;

        public connect(url: string) {
            this._socket = new WebSocket(url, "kmud");
            this._socket.onopen = e => this.onopen(e);
            this._socket.onclose = e => this.onclose(e);
            this._socket.onerror = e => this.onerror(e);
            this._socket.onmessage = e => this.onmessage(e);
        }

        public SendMessage(message: MessageBase) {
            if (this._socket) {
                this._socket.send(JSON.stringify(message));
            }
        }

        private onopen(e: Event) {

        }
        private onclose(e: Event) {
            this.addOutput(document.getElementById("Output"), "Disconnected", "error-text");
        }
        private onerror(e: Event) {
        }
        private onmessage(e: Event) {
            var message: MessageBase = JSON.parse((<any>e).data);

            var handler = this.messageHandlers[message.MessageName];
            if (handler != null) {
                handler(message);
            }
        }

        private registerMessageHandlers() {
            this.messageHandlers[LoginRejected.ClassName] = (message: LoginRejected) => {
                this.addOutput(document.getElementById("Output"), message.RejectionMessage, "error-text");
                if (message.NoCharacter == true) {
                    window.location.replace("/Home/ChooseRace");
                }
            }

            this.messageHandlers[PongMessage.ClassName] = (message: PongMessage) => {
                var latency = new Date().valueOf() - new Date((<any>message).SendTime).valueOf();
                this.addOutput(document.getElementById("Output"), "Ping: Latency " + latency + "ms", "system-text");
            }

            this.messageHandlers[ServerMessage.ClassName] = (message: ServerMessage) => this.addOutput(document.getElementById("Output"), message.Contents);
            this.messageHandlers[RoomDescriptionMessage.ClassName] = (message: RoomDescriptionMessage) => this.showRoomDescription(message);
            this.messageHandlers[CommunicationMessage.ClassName] = (message: CommunicationMessage) => this.showCommunication(message);
            this.messageHandlers[ActorInformationMessage.ClassName] = (message: ActorInformationMessage) => this.currentPlayer = message;
            this.messageHandlers[InventoryListMessage.ClassName] = (message: InventoryListMessage) => this.showInventory(message);
            this.messageHandlers[LoginStateMessage.ClassName] = (message: LoginStateMessage) => this.loginMessage(message);
            this.messageHandlers[PartyMovementMessage.ClassName] = (message: PartyMovementMessage) => this.partyMovement(message);
            this.messageHandlers[ItemOwnershipMessage.ClassName] = (message: ItemOwnershipMessage) => this.itemOwnership(message);
            this.messageHandlers[CashTransferMessage.ClassName] = (message: CashTransferMessage) => this.cashTransfer(message);
            this.messageHandlers[SearchMessage.ClassName] = (message: SearchMessage) => this.search(message);
            this.messageHandlers[ActionNotAllowedMessage.ClassName] = (message: ActionNotAllowedMessage) => this.addOutput(this.mainOutput, message.Message, "action-not-allowed");
            this.messageHandlers[GenericMessage.ClassName] = (message: GenericMessage) => this.addOutput(this.mainOutput, message.Message, message.Class);
            this.messageHandlers[AmbiguousActorMessage.ClassName] = (message: AmbiguousActorMessage) => this.ambiguousActors(message);
            this.messageHandlers[AmbiguousItemMessage.ClassName] = (message: AmbiguousItemMessage) => this.ambiguousItems(message);

            this.messageHandlers[ItemEquippedChangedMessage.ClassName] = (message: ItemEquippedChangedMessage) => this.equipChanged(message);
        }

        private registerCommandHandlers() {
            this.commandHandlers["ping"] = x => this.ping();

            this.commandHandlers["n"] = this.commandHandlers["north"] = words => this.move(Direction.North);
            this.commandHandlers["s"] = this.commandHandlers["south"] = words => this.move(Direction.South);
            this.commandHandlers["e"] = this.commandHandlers["east"] = words => this.move(Direction.East);
            this.commandHandlers["w"] = this.commandHandlers["west"] = words => this.move(Direction.West);
            this.commandHandlers["ne"] = this.commandHandlers["northeast"] = words => this.move(Direction.Northeast);
            this.commandHandlers["nw"] = this.commandHandlers["northwest"] = words => this.move(Direction.Northwest);
            this.commandHandlers["se"] = this.commandHandlers["southeast"] = words => this.move(Direction.Southeast);
            this.commandHandlers["sw"] = this.commandHandlers["southwest"] = words => this.move(Direction.Southwest);
            this.commandHandlers["u"] = this.commandHandlers["up"] = words => this.move(Direction.Up);
            this.commandHandlers["d"] = this.commandHandlers["down"] = words => this.move(Direction.Down);
            this.commandHandlers["l"] = this.commandHandlers["look"] = words => this.look(words.tail(0));

            this.commandHandlers["i"] = this.commandHandlers["inv"] = this.commandHandlers["inventory"] = words => this.SendMessage(new InventoryCommand());
            this.commandHandlers["get"] = this.commandHandlers["g"] = words => this.get(words.tail(0));
            this.commandHandlers["drop"] = this.commandHandlers["dr"] = words => this.drop(words.tail(0), false);
            this.commandHandlers["hide"] = this.commandHandlers["hid"] = words => this.drop(words.tail(0), true);
            this.commandHandlers["search"] = this.commandHandlers["sea"] = words => this.SendMessage(new SearchCommand());
            this.commandHandlers["equip"] = this.commandHandlers["eq"] = this.commandHandlers["arm"] = this.commandHandlers["ar"] = words => this.SendMessage(new EquipCommand(null, words.tail(0)));
            this.commandHandlers["remove"] = this.commandHandlers["rem"] = words => this.SendMessage(new RemoveCommand(null, words.tail(0)));
            this.commandHandlers["give"] = words => this.give(words.tail(0));


            this.commandHandlers["gos"] = this.commandHandlers["gossip"] = words => this.talk(words.tail(0), CommunicationType.Gossip);
            this.commandHandlers["say"] = words => this.talk(words.tail(0), CommunicationType.Say);

            this.commandHandlers["sys"] = this.commandHandlers["sysop"] = words => { this.SendMessage(new SysopMessage(words.tail(0))) }

            this.symbolCommandHandlers["."] = words => this.talk(words.tail(-1).substr(1), CommunicationType.Say);
            this.symbolCommandHandlers["/"] = words => this.talk(words.tail(0), CommunicationType.Telepath, words.token(0).substr(1));
        }

        private loginMessage(message: LoginStateMessage) {
            if (message.Login == true) {
                this.addOutput(this.mainOutput, message.Actor.Name + " just entered the Realm.", "login");
            }
            else {
                this.addOutput(this.mainOutput, message.Actor.Name + " just left the Realm.", "logout");
            }
        }

        private get(item: string) {
            var message = new GetItemCommand();
            var quantity = Str.parseQuantity(item);
            message.Quantity = quantity[0];
            message.ItemName = quantity[1];
            this.SendMessage(message);
        }

        private drop(item: string, hide: boolean) {
            var message = new DropItemCommand();
            message.Hide = hide;

            var quantity = Str.parseQuantity(item);
            message.Quantity = quantity[0];
            message.ItemName = quantity[1];

            this.SendMessage(message);
        }

        private talk(text: string, type: CommunicationType, param?: string) {
            if (Str.empty(text))
                return; // don't bother sending empty messages.

            var message = new CommunicationMessage();
            message.Message = text;
            message.Type = type;
            if (param !== undefined) {
                message.ActorName = param;
            }
            this._socket.send(JSON.stringify(message));
        }

        private look(parameter: string, brief: boolean = false) {
            var message = new LookMessage()
            message.Brief = brief;

            //TODO: Parse parameters
            this._socket.send(JSON.stringify(message));
        }

        private move(direction: Direction) {
            var message = new MoveMessage()
            message.Direction = direction;
            this._socket.send(JSON.stringify(message));
        }

        private ping() {
            var message = new PingMessage();
            message.SendTime = new Date();
            this._socket.send(JSON.stringify(message));
        }

        private partyMovement(message: PartyMovementMessage) {
            var actors = Linq(message.Actors);
            if (actors.areAny(x => x.Id == this.currentPlayer.Id)) {
                // You're the one moving.

                // Don't show anything if you move. I guess. That's how MajorMUD works. 
                if (message.Enter == false && message.Leader.Id != this.currentPlayer.Id) {
                    // else show the party lead message.
                    this.addOutput(this.mainOutput, " -- Following your Party leader " + Direction[message.Direction].toLowerCase() + " --", "party-follow");
                }
            }
            else {
                // TODO: Player Link
                var runs = this.createElements(actors.toArray(), x => x.Name, "moving-player", "a");
                var runs = this.joinElements(runs, ", ", "player-separator");

                if (message.Enter) {
                    var verb = "walks";
                    if (message.Actors.length > 1)
                        verb = "walk";
                    runs.push(this.createElement(" " + verb + " into the room from the " + Direction[message.Direction].toLowerCase() + ".", "party-movement"));
                }
                else {
                    runs.push(this.createElement(" just left to the " + Direction[message.Direction].toLowerCase() + ".", "party-movement"));
                }

                this.addElements(this.mainOutput, runs);
            }
        }

        private itemOwnership(message: ItemOwnershipMessage) {
            var groups = Linq(message.Items).groupBy(x => x.TemplateId + "|" + x.Name).toArray();

            for (var i = 0; i < groups.length; i++) {
                var name = groups[i].values[0].Name;
                if (groups[i].values.length > 1) {
                    name = String(groups[i].values.length) + " " + name;
                }

                if (message.Giver != null && message.Taker != null) {
                    // player-to-player transfer
                    if (message.Giver.Id == this.currentPlayer.Id) {
                        this.addOutput(this.mainOutput, "You just gave " + name + " to " + message.Taker.Name + ".", "item-ownership");
                    }
                    else if (message.Taker.Id == this.currentPlayer.Id) {
                        this.addOutput(this.mainOutput, message.Giver.Name + " just gave you " + name + ".", "item-ownership");
                    }
                    else {
                        this.addOutput(this.mainOutput, message.Giver.Name + " just gave " + message.Taker.Name + " something.", "item-ownership");
                    }
                }
                else {
                    if (message.Giver != null && message.Giver.Id == this.currentPlayer.Id) {
                        var verb = "dropped";
                        if (message.Hide)
                            verb = "hid";

                        this.addOutput(this.mainOutput, "You " + verb + " " + name + ".", "item-ownership");
                    }
                    else if (message.Taker != null && message.Taker.Id == this.currentPlayer.Id) {
                        this.addOutput(this.mainOutput, "You took " + name + ".", "item-ownership");
                    }
                    else if (message.Giver != null) {
                        this.addOutput(this.mainOutput, message.Giver.Name + " dropped " + name + ".", "item-ownership");
                    }
                    else if (message.Taker != null) {
                        this.addOutput(this.mainOutput, message.Taker.Name + " picks up " + name + ".", "item-ownership");
                    }
                }
            }
        }

        private cashTransfer(message: CashTransferMessage) {
            var name = message.Currency.Name;
            if (message.Currency.Amount > 0) {
                name = this.pluralize(name, message.Currency.Amount);
            }
            else {
                name = "some " + this.pluralize(name, 0, true);
            }

            if (message.Giver != null && message.Taker != null) {
                // player-to-player transfer
                if (message.Giver.Id == this.currentPlayer.Id) {
                    this.addOutput(this.mainOutput, "You just gave " + name + " to " + message.Taker.Name + ".", "item-ownership");
                }
                else if (message.Taker.Id == this.currentPlayer.Id) {
                    this.addOutput(this.mainOutput, message.Giver.Name + " just gave you " + name + ".", "item-ownership");
                }
                else {
                    this.addOutput(this.mainOutput, message.Giver.Name + " just gave " + message.Taker.Name + " something.", "item-ownership");
                }
            }
            else {
                if (message.Giver != null && message.Giver.Id == this.currentPlayer.Id) {
                    var verb = "dropped";
                    if (message.Hide)
                        verb = "hid";

                    this.addOutput(this.mainOutput, "You " + verb + " " + name + ".", "item-ownership");
                }
                else if (message.Taker != null && message.Taker.Id == this.currentPlayer.Id) {
                    this.addOutput(this.mainOutput, "You took " + name + ".", "item-ownership");
                }
                else if (message.Giver != null) {
                    this.addOutput(this.mainOutput, message.Giver.Name + " dropped " + name + ".", "item-ownership");
                }
                else if (message.Taker != null) {
                    this.addOutput(this.mainOutput, message.Taker.Name + " picks up " + name + ".", "item-ownership");
                }
            }
        }

        private search(message: SearchMessage) {
            if (message.FoundCash.length == 0 && message.FoundItems.length == 0) {
                this.addOutput(this.mainOutput, "Your search revealed nothing.", "search");
                return;
            }

            var items = [];
            for (var i = 0; i < message.FoundCash.length; i++) {
                items.push(message.FoundCash[i].Amount + " " + message.FoundCash[i].Name);
            }

            if (message.FoundItems.length > 0) {
                var groups = Linq(message.FoundItems).groupBy(x => x.TemplateId + "|" + x.Name);
                pushRange(items, groups.select(x => (x.values.length > 1 ? String(x.values.length) + " " : "") + x.values[0].Name).toArray());
            }

            this.addOutput(this.mainOutput, "You notice " + items.join(", ") + " here.", "search-found");
        }

        private give(parameters: string) {
            var tokens = new Tokenizer(parameters);

            var split = tokens.split("to");

            if (split.length != 2) {
                this.talk(parameters, CommunicationType.Say);
                return;
            }

            var quantity = Str.parseQuantity(split[0]);

            this.SendMessage(new GiveCommand(null, quantity[1], null, split[1], quantity[0]));
        }

        private showRoomDescription(message: RoomDescriptionMessage) {
            if (message.CannotSee) {
                if (!Str.empty(message.CannotSeeMessage)) {
                    this.addOutput(this.mainOutput, message.CannotSeeMessage, "cannot-see");
                }
                else {
                    if (message.LightLevel == LightLevel.Nothing)
                        this.addOutput(this.mainOutput, "The room is darker than anything you've ever seen before - you can't see anything", "cannot-see");
                    if (message.LightLevel == LightLevel.PitchBlack)
                        this.addOutput(this.mainOutput, "The room is pitch black - you can't see anything", "cannot-see");
                    if (message.LightLevel == LightLevel.VeryDark)
                        this.addOutput(this.mainOutput, "The room is very dark - you can't see anything", "cannot-see");
                }
            }
            else {
                this.addOutput(this.mainOutput, message.Name, "room-name");
                if (Str.notEmpty(message.Description)) {
                    this.addOutput(this.mainOutput, message.Description, "room-desc");
                }

                // Items
                var visibleGroups = this.groupItems(message.VisibleItems);
                var foundGroups = this.groupItems(message.FoundItems);

                var itemRuns: HTMLElement[] = [];
                pushRange(itemRuns, this.createElements(message.VisibleCash, x => this.pluralize(x.Name, x.Amount), "item-cash", "a"));
                pushRange(itemRuns, this.createElements(message.FoundCash, x => this.pluralize(x.Name, x.Amount), "item-cash-hidden", "a"));
                pushRange(itemRuns, this.createElements(visibleGroups.toArray(), x => this.pluralize(x.values[0].Name, x.values.length), "item-visible", "a"));
                pushRange(itemRuns, this.createElements(foundGroups.toArray(), x => this.pluralize(x.values[0].Name, x.values.length), "item-hidden", "a"));
                itemRuns = this.joinElements(itemRuns, ", ", "item-separator");

                if (itemRuns.length != 0) {

                    this.addOutput(this.mainOutput, "You notice ", "items", false);
                    this.addElements(this.mainOutput, itemRuns, false);
                    this.addOutput(this.mainOutput, " here.", "items");
                }

                // Actors
                if (message.Actors.length > 1) {
                    var actors = message.Actors.filter(x => x.Id != this.currentPlayer.Id)
                    this.addOutput(this.mainOutput, "Also here: " + actors.map(x=> x.Name).join(", ") + ".", "actors");
                }

                // Exits
                if (message.Exits.length > 0) {
                    this.addOutput(this.mainOutput, "Obvious exits: " + message.Exits.map(x=> x.Name).join(", "), "exits");
                }
                else {
                    this.addOutput(this.mainOutput, "Obvious exits: NONE!!!", "exits");
                }

                if (message.LightLevel == LightLevel.BarelyVisible)
                    this.addOutput(this.mainOutput, "The room is barely visible", "dimly-lit");
                if (message.LightLevel == LightLevel.DimlyLit)
                    this.addOutput(this.mainOutput, "The room is dimly lit", "dimly-lit");
            }
        }

        private showCommunication(message: CommunicationMessage) {
            switch (message.Type) {
                case CommunicationType.Gossip:
                    this.addOutput(this.mainOutput, message.ActorName + " gossips: " + message.Message, "gossip");
                    this.notify();
                    break;

                case CommunicationType.Say:
                    if (message.ActorId == this.currentPlayer.Id) {
                        this.addOutput(this.mainOutput, "You say \"" + message.Message + "\"", "say");
                    }
                    else {
                        this.addOutput(this.mainOutput, message.ActorName + " says \"" + message.Message + "\"", "say");
                        this.notify();
                    }
                    break;

                case CommunicationType.Telepath:
                    this.addOutput(this.mainOutput, message.ActorName + " telepaths " + message.Message, "telepath");
                    this.notify();
                    break;
            }
        }

        private showInventory(message: InventoryListMessage) {
            var equipped = Linq(message.Items).where(x => x.EquippedSlot != null).orderBy(x => x.EquippedSlot);
            var groups = Linq(message.Items).where(x => x.EquippedSlot == null).groupBy(x => x.TemplateId + "|" + x.Name).orderBy(x => x.first().Name);

            var itemRuns: HTMLElement[] = [];
            pushRange(itemRuns, this.createElements(message.Cash, x => this.pluralize(x.Name, x.Amount), "item-cash", "a"));
            pushRange(itemRuns, this.createElements(equipped.toArray(), x => x.Name + " (" + EquipmentSlot[x.EquippedSlot] + ")", "item-equipped", "a"));
            pushRange(itemRuns, this.createElements(groups.toArray(), x => this.pluralize(x.values[0].Name, x.values.length), "item-held", "a"));
            itemRuns = this.joinElements(itemRuns, ", ", "item-separator");

            if (itemRuns.length == 0) {
                itemRuns.push(this.createElement("Nothing!", "item-none"));
            }
            itemRuns.unshift(this.createElement("You are carrying: ", "inventory-label"));
            this.addElements(this.mainOutput, itemRuns);

            //TODO: You have no keys.

            this.addOutput(this.mainOutput, "Wealth: ", "wealth-label", false);
            this.addOutput(this.mainOutput, this.pluralize(message.TotalCash.Name, message.TotalCash.Amount), "wealth-amount");

            var pct = Math.round((message.Encumbrance / message.MaxEncumbrance) * 100);
            var category = "Heavy";
            if (pct <= 66)
                category = "Medium";
            else if (pct <= 33)
                category = "Light";
            else if (pct <= 15)
                category = "None";

            this.addOutput(this.mainOutput, "Encumbrance: ", "encumbrance-label", false);
            this.addOutput(this.mainOutput, message.Encumbrance + "/" + message.MaxEncumbrance + " - " + category + " [" + pct + "%]", "encumbrance-value");
        }

        private ambiguousActors(message: AmbiguousActorMessage) {
            this.addOutput(this.mainOutput, "Please be more specific.  You could have meant any of these:", "error");
            for (var i = 0; i < message.Actors.length; i++) {
                this.addOutput(this.mainOutput, "-- " + message.Actors[i].Name);
            }
        }

        private ambiguousItems(message: AmbiguousItemMessage) {
            this.addOutput(this.mainOutput, "Please be more specific.  You could have meant any of these:", "error");
            for (var i = 0; i < message.Items.length; i++) {
                this.addOutput(this.mainOutput, "-- " + message.Items[i].Name);
            }
        }

        private equipChanged(message: ItemEquippedChangedMessage) {

            if (message.Equipped) {
                if (message.Actor.Id == this.currentPlayer.Id) {
                    if (message.Item.EquippedSlot == EquipmentSlot.Weapon || message.Item.EquippedSlot == EquipmentSlot.Offhand || message.Item.EquippedSlot == EquipmentSlot.Light) {
                        this.addOutput(this.mainOutput, "You are now holding " + message.Item.Name + ".", "equip");
                    }
                    else {
                        this.addOutput(this.mainOutput, "You are now wearing " + message.Item.Name + ".", "equip");
                    }
                }
                else {
                    if (message.Item.EquippedSlot == EquipmentSlot.Weapon || message.Item.EquippedSlot == EquipmentSlot.Offhand || message.Item.EquippedSlot == EquipmentSlot.Light) {
                        this.addOutput(this.mainOutput, message.Actor.Name + " readies " + message.Item.Name + "!", "equip");
                    }
                    else {
                        this.addOutput(this.mainOutput, message.Actor.Name + " wears " + message.Item.Name + "!", "equip");
                    }
                }
            }
            else {
                if (message.Actor.Id == this.currentPlayer.Id) {
                    this.addOutput(this.mainOutput, "You have removed " + message.Item.Name + ".", "equip");
                }
                else {
                    this.addOutput(this.mainOutput, message.Actor.Name + " removes " + message.Item.Name + "!", "equip");
                }
            }
        }


        //////////////////////////////////////////////////////////////////////////////////
        // OUTPUT ROUTINES 
        /////////////////////////////////////////////////////////////////////////////////

        private addElements(target: HTMLElement, elements: HTMLElement[], finished: boolean = true) {
            var scrolledToBottom = Math.abs((target.scrollHeight - target.scrollTop) - target.offsetHeight) < 10;

            for (var i = 0; i < elements.length; i++) {
                target.appendChild(elements[i]);
            }

            if (finished) {
                var newLine = document.createElement("br");
                target.appendChild(newLine);
            }

            // Keep scrolling to bottom if they're already there.
            if (scrolledToBottom) {
                target.scrollTop = target.scrollHeight;
            }
        }

        private addOutput(target: HTMLElement, text: string, css?: string, finished: boolean = true) {
            var element = document.createElement("span");
            element.textContent = text;

            if (css !== undefined) {
                element.className = css;
            }
            this.addElements(target, [element], finished);
        }

        /**
         * Creates an array of HTML Elements based on the provided list of items and options.
         */
        private createElements<T>(items: ArrayLikeObject<T>, caption: Func1<T, string>, css?: string|Func1<T, string>, elementName: string = "span", decorator?: Action2<T, HTMLElement>): HTMLElement[] {
            var elements: HTMLElement[] = [];
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var c: string;
                if (css !== undefined) {
                    if (typeof css === 'string') {
                        c = css;
                    }
                    else {
                        c = css(item);
                    }
                }
                var element = this.createElement(caption(item), c, elementName);

                if (decorator !== undefined) {
                    decorator(item, element);
                }

                elements.push(element);
            }
            return elements;
        }

        private createElement(caption: string, css?: string, elementName: string = "span"): HTMLElement {
            var element = document.createElement(elementName);
            element.textContent = caption;

            if (css !== undefined) {
                element.className = css;
            }

            return element;
        }

        /**
         * Joins a group of HTML Elements together with a separator span.
         */
        private joinElements(elements: HTMLElement[], separator: string, separatorClass?: string): HTMLElement[] {
            var output: HTMLElement[] = [];
            for (var i = 0; i < elements.length; i++) {
                output.push(elements[i]);
                if (i != elements.length - 1) {
                    elements[i].textContent += separator;
                    //var span = document.createElement("span");
                    //span.textContent = separator;

                    //if (separatorClass !== undefined) {
                    //    span.className = separatorClass;
                    //}
                    //output.push(span);
                }
            }

            return output;
        }

        public pluralize(name: string, quantity: number, omitNumber = false) {
            if (quantity == 1)
                return name;
            var res = "";
            if (!omitNumber) {
                res = Str.formatNumber(quantity) + " ";
            }
            if (Str.endsWith(name, "y"))
                return res + name.substr(0, name.length - 1) + "ies";
            if (Str.endsWith(name, "ch"))
                return res + name + "es";
            return res + name + "s";
        }

        public groupItems(items: LinqContainer<ItemDescription> | ItemDescription[]): LinqContainer<Grouping<ItemDescription, string>> {
            var linq: LinqContainer<ItemDescription>;
            if (Array.isArray(items)) {
                linq = Linq(<ItemDescription[]>items);
            }
            else {
                linq = <LinqContainer<ItemDescription>>items;
            }
            return linq.groupBy(x => x.TemplateId + "|" + x.Name);
        }
    }

    export class Str {
        public static formatNumber(n: number) {
            return n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }

        public static notEmpty(s: string): boolean {
            return !this.empty(s);
        }

        public static empty(s: string): boolean {
            return (s === null || s === undefined || /^\s*$/g.test(s));
        }

        public static formatString(str: string, args: any[]): string {
            return str.replace(/{(\d+)}/g, function (match: string, ...i: any[]) {
                return typeof args[i[0]] != 'undefined' ? args[i[0]] : match;
            });
        }

        public static endsWith(str: string, ends: string, caseSensitive: boolean = false): boolean {
            if (!caseSensitive) {
                str = str.toLowerCase();
                ends = ends.toLowerCase();
            }

            if (ends.length > str.length)
                return false;

            return str.substr(str.length - ends.length) == ends;
        }

        public static startsWith(str: string, starts: string, caseSensitive: boolean = false): boolean {
            if (!caseSensitive) {
                str = str.toLowerCase();
                starts = starts.toLowerCase();
            }

            if (starts.length > str.length)
                return false;

            return str.substr(0, starts.length) == starts;
        }

        // Referring to the table here:
        // https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/regexp
        // these characters should be escaped
        // \ ^ $ * + ? . ( ) | { } [ ]
        // These characters only have special meaning inside of brackets
        // they do not need to be escaped, but they MAY be escaped
        // without any adverse effects (to the best of my knowledge and casual testing)
        // : ! , = 
        private static _escapeRegExpCharacters: string[] = [
            "-", "[", "]",  // order matters for these
            "/", "{", "}", "(", ")", "*", "+", "?", ".", "\\", "^", "$", "|" // order doesn't matter for any of these
        ];

        private static _escapeRegExpRegexp: RegExp = new RegExp('[' + Str._escapeRegExpCharacters.join('\\') + ']', 'g');

        public static escapeRegExp(str: string): string {
            return str.replace(Str._escapeRegExpRegexp, "\\$&");
        }

        public static parseQuantity(str: string): any[] {
            var tokens = new Tokenizer(str);
            var quantity = parseInt(tokens.token(0));
            var result = [];
            if (!isNaN(quantity)) {
                result[0] = quantity;
                result[1] = tokens.tail(0);
            }
            else {
                result[0] = 0;
                result[1] = str;
            }

            return result;
        }
    }

    export class Tokenizer {

        private _tokens: string[];
        private _indices: number[] = [];

        constructor(private _str: string) {
            this._tokens = _str.split(/\s+/gi);

            var lastIndex: number = 0;
            for (var i = 0; i < this._tokens.length; i++) {
                lastIndex = _str.indexOf(this._tokens[i], lastIndex);
                this._indices[i] = lastIndex;
                lastIndex += this._tokens[i].length;
            }
        }

        /**
         * Returns the token at the given index.
         */
        public token(index: number): string {
            return this._tokens[index];
        }

        /**
         * Returns the tail end of the string, not including the token at the given index. 
         * The original string formatting is preserved, starting at the place where the first valid token starts. 
         */
        public tail(index: number): string {
            if (index >= this._tokens.length - 1)
                return null;

            return this._str.substr(this._indices[index + 1]);
        }

        /**
         * Returns the head of the string, not including the token at the given index. 
         * The original string formatting is preserved, starting at the place where the first valid token starts. 
         */
        public head(index: number): string {
            if (index <= 0)
                return null;

            return this._str.substr(0, this._indices[index]);
        }

        /**
         * Splits the string into substrings, separated by the last instance of the given token.
         * The token is not included in the output.
         * Origginal string formatting is preserved.
         */
        public split(token: string): string[] {
            var index = -1;
            for (var i = this._tokens.length - 1; i >= 0; i--) {
                if (this._tokens[i].toLowerCase() == token.toLowerCase()) {
                    index = i;
                    break;
                }
            }

            if (index == -1)
                return [];
            return [this.head(index), this.tail(index)];
        }

        public get length(): number {
            return this._tokens.length;
        }
    }
}