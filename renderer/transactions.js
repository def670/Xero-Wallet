const {ipcRenderer} = require('electron');

class Transactions {
    constructor() {
        this.filter = "";
        this.isSyncing = false;
    }

    setIsSyncing(value) {
        this.isSyncing = value;
    }

    getIsSyncing() {
        return this.isSyncing;
    }

    setFilter(text) {
        this.filter = text;
    }

    getFilter() {
        return this.filter;
    }

    clearFilter() {
        this.filter = "";
    }

    syncTransactionsForSingleAddress(addressList, counters, lastBlock, counter) { 
        if (counter < addressList.length - 1) {
            SyncProgress.setText(vsprintf("Syncing address transactions %d/%d, please wait...", [counter, addressList.length]));

            var startBlock = parseInt(counters.transactions) || 0;
            var params = vsprintf('?address=%s&fromBlock=%d&toBlock=%d', [addressList[counter].toLowerCase(), startBlock, lastBlock]);
            
            $.getJSON("https://richlist.ether1.org/transactions_list.php" + params,  function( result ) {
                result.data.forEach(element => {
                    ipcRenderer.send('storeTransaction', {
                        block: element.block.toString(),
                        txhash: element.txhash.toLowerCase(),
                        fromaddr: element.fromaddr.toLowerCase(),
                        timestamp: element.timestamp,
                        toaddr: element.toaddr.toLowerCase(),
                        value: element.value
                    });
                });
        
                // call the transaction sync for the next address
                EthoTransactions.syncTransactionsForSingleAddress(addressList, counters, lastBlock, counter + 1);
            });  
        } else {
            // update the counter and store it back to file system
            counters.transactions = lastBlock;
            ipcRenderer.sendSync('setJSONFile', 
            { 
                file: 'counters.json',
                data: counters
            });

            SyncProgress.setText("Syncing transactions is complete.");
            EthoTransactions.setIsSyncing(false);
        }
    }

    syncTransactionsForAllAddresses(lastBlock) {
        var counters = ipcRenderer.sendSync('getJSONFile', 'counters.json');
        var counter = 0;

        if (counters == null) {
            counters = {};    
        }

        EthoBlockchain.getAccounts(
            function(error) {
                EthoMainGUI.showGeneralError(error);
            },
            function(data) {
                EthoTransactions.setIsSyncing(true);
                EthoTransactions.syncTransactionsForSingleAddress(data, counters, lastBlock, counter);
            }
        );
    }

    renderTransactions() {
        EthoMainGUI.renderTemplate("transactions.html", {});          
        $(document).trigger("render_transactions");
        
        // show the loading overlay for transactions
        $("#loadingTransactionsOverlay").css("display", "block");
    
        setTimeout(() => {
             var dataTransactions = ipcRenderer.sendSync('getTransactions');
             var addressList = EthoWallets.getAddressList();

             dataTransactions.forEach(function(element) {
                var isFromValid = (addressList.indexOf(element[2].toLowerCase()) > -1);
                var isToValid = (addressList.indexOf(element[3].toLowerCase()) > -1);
          
                if ((isToValid) && (!isFromValid)) {
                  element.unshift(0);
                } else if ((!isToValid) && (isFromValid)) { 
                    element.unshift(1);
                } else {
                    element.unshift(2);
                }
            });

            EthoTableTransactions.initialize('#tableTransactionsForAll', dataTransactions);             
        }, 200);
    }

}

// event that tells us that geth is ready and up
$(document).on("onSyncInterval", function() {
    var counters = ipcRenderer.sendSync('getJSONFile', 'counters.json');

    if (counters == null) {
        counters = {};    
    }

    function doSyncRemainingBlocks() {
        EthoBlockchain.getBlock("latest", false,
            function(error) {
                EthoMainGUI.showGeneralError(error);
            },
            function(block) {
                var lastBlock = counters.transactions || 0;

                if (lastBlock < block.number) {
                    function getNextBlockTransactions(blockNumber, maxBlock) {
                        EthoBlockchain.getBlock(blockNumber, true,
                            function(error) {
                                EthoMainGUI.showGeneralError(error);
                            },
                            function(data) {
                                if (blockNumber < maxBlock) {
                                    if (data.transactions) {                                    
                                        data.transactions.forEach(element => {
                                            if ((EthoWallets.getAddressExists(element.from)) || (EthoWallets.getAddressExists(element.to))) {
                                                var Transaction = {
                                                    block: element.blockNumber.toString(),
                                                    txhash: element.hash.toLowerCase(),
                                                    fromaddr: element.from.toLowerCase(),
                                                    timestamp: moment.unix(data.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                                                    toaddr: element.to.toLowerCase(),
                                                    value: Number(element.value).toExponential(5).toString().replace('+','')
                                                }
                                                
                                                // store transaction and notify about new transactions
                                                ipcRenderer.send('storeTransaction', Transaction);
                                                $(document).trigger("onNewAccountTransaction");

                                                if (EthoMainGUI.getAppState() == "transactions") { 
                                                    //$('#tableTransactionsForAll').DataTable().ajax.reload();
                                                }
                                            }
                                        });                    
                                    }

                                    // call the next iteration for the next block 
                                    getNextBlockTransactions(blockNumber + 1 , maxBlock)    
                                } else {
                                    setTimeout(function() { 
                                        doSyncRemainingBlocks();
                                    }, 10000);                                    
                                }
                                
                            }
                        );
                    }

                    // call initial call of function
                    getNextBlockTransactions(lastBlock, block.number);
                } else {                    
                    counters.transactions = block.number;
                    ipcRenderer.sendSync('setJSONFile', 
                    { 
                        file: 'counters.json',
                        data: counters
                    });

                    setTimeout(function() { 
                        doSyncRemainingBlocks();
                    }, 10000);                    
                }
            }
        );        
    }

    // do the initial sync
    doSyncRemainingBlocks();
});
  
        
// create new transactions variable
EthoTransactions = new Transactions();  