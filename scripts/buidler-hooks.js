/*
 * These hooks are called by the Aragon Buidler plugin during the start task's lifecycle. Use them to perform custom tasks at certain entry points of the development build process, like deploying a token before a proxy is initialized, etc.
 *
 * Link them to the main buidler config file (buidler.config.js) in the `aragon.hooks` property.
 *
 * All hooks receive two parameters:
 * 1) A params object that may contain other objects that pertain to the particular hook.
 * 2) A "bre" or BuidlerRuntimeEnvironment object that contains enviroment objects like web3, Truffle artifacts, etc.
 *
 * Please see AragonConfigHooks, in the plugin's types for further details on these interfaces.
 * https://github.com/aragon/buidler-aragon/blob/develop/src/types.ts#L31
 */

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const TOKEN_TRANSFERABLE = true
const TOKEN_DECIMALS = 18
const TOKEN_MAX_PER_ACCOUNT = 0
const DEFAULT_FINANCE_PERIOD = 30 * 24 * 60 * 60
const VOTE_SETTINGS = [
  '500000000000000000',
  '150000000000000000',
  '86400',
]

let token

module.exports = {
  // Called before a dao is deployed.
  preDao: async ({ log }, { web3, artifacts }) => {},

  // Called after a dao is deployed.
  postDao: async (
    { dao, _experimentalAppInstaller, log },
    { web3, artifacts }
  ) => {},

  // Called after the app's proxy is created, but before it's initialized.
  preInit: async (
    { proxy, _experimentalAppInstaller, log },
    { web3, artifacts }
  ) => {
    const MiniMeToken = artifacts.require('MiniMeToken')
    token = await MiniMeToken.new(
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      0,
      'Token',
      TOKEN_DECIMALS,
      'TKN',
      TOKEN_TRANSFERABLE
    )
    const accounts = await web3.eth.getAccounts()
    await token.generateTokens(accounts[0], '1000000000000000000')
    await token.generateTokens(accounts[1], '1000000000000000000')

    await token.changeController(proxy.address)
  },

  // Called after the app's proxy is initialized.
  postInit: async (
    { proxy, _experimentalAppInstaller, log },
    { web3, artifacts }
  ) => {
    // Install voting
    const voting = await _experimentalAppInstaller('voting', {
      initializeArgs: [token.address, ...VOTE_SETTINGS],
    })
    await voting.createPermission('CREATE_VOTES_ROLE')

    // Install vault and finance
    const vault = await _experimentalAppInstaller('vault')
    const finance = await _experimentalAppInstaller('finance', {
      initializeArgs: [vault.address, DEFAULT_FINANCE_PERIOD],
    })
    await vault.createPermission('TRANSFER_ROLE', finance.address)
    await finance.createPermission('CREATE_PAYMENTS_ROLE', voting.address)
  },

  // Called when the start task needs to know the app proxy's init parameters.
  // Must return an array with the proxy's init parameters.
  getInitParams: async ({ log }, { web3, artifacts }) => {
    return [
      token.address,
      TOKEN_TRANSFERABLE,
      TOKEN_MAX_PER_ACCOUNT,
    ]
  },

  // Called after the app's proxy is updated with a new implementation.
  // TODO: At the moment we don't have permissions to issue or assign tokens
  // outside this hook: https://github.com/aragon/buidler-aragon/issues/143 
  postUpdate: async ({ proxy, log }, { web3, artifacts }) => {
    // Add vestings
    const DAYS = 24 * 60 * 60
    const NOW = Math.floor(Date.now() / 1000)
    const VESTING_CLIFF_PERIOD = 90 * DAYS
    const VESTING_COMPLETE_PERIOD = 360 * DAYS
    const accounts = await web3.eth.getAccounts()
    await proxy.issue('2000000000000000000')
    for (let i = 0; i < 2; i++) {
      await proxy.assignVested(
        accounts[i],
        '1000000000000000000',
        NOW,
        NOW + VESTING_CLIFF_PERIOD,
        NOW + VESTING_CLIFF_PERIOD + VESTING_COMPLETE_PERIOD,
        true // revokable
      )
    }
  },
}
