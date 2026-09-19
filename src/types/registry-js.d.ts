/**
 * Ambient types for registry-js when the native package is not installed
 * (non-Windows — registry-js is an optionalDependency that fails to build on Linux).
 */
declare module 'registry-js' {
  export enum HKEY {
    HKEY_CLASSES_ROOT = 'HKEY_CLASSES_ROOT',
    HKEY_CURRENT_USER = 'HKEY_CURRENT_USER',
    HKEY_LOCAL_MACHINE = 'HKEY_LOCAL_MACHINE',
    HKEY_USERS = 'HKEY_USERS',
    HKEY_CURRENT_CONFIG = 'HKEY_CURRENT_CONFIG',
  }

  export enum RegistryValueType {
    REG_NONE = 'REG_NONE',
    REG_SZ = 'REG_SZ',
    REG_EXPAND_SZ = 'REG_EXPAND_SZ',
    REG_BINARY = 'REG_BINARY',
    REG_DWORD = 'REG_DWORD',
    REG_DWORD_BIG_ENDIAN = 'REG_DWORD_BIG_ENDIAN',
    REG_LINK = 'REG_LINK',
    REG_MULTI_SZ = 'REG_MULTI_SZ',
    REG_RESOURCE_LIST = 'REG_RESOURCE_LIST',
    REG_FULL_RESOURCE_DESCRIPTOR = 'REG_FULL_RESOURCE_DESCRIPTOR',
    REG_RESOURCE_REQUIREMENTS_LIST = 'REG_RESOURCE_REQUIREMENTS_LIST',
    REG_QWORD = 'REG_QWORD',
  }

  export interface RegistryValue {
    name: string;
    type: RegistryValueType;
    data: string;
  }

  export function enumerateValues(hive: HKEY, key: string): RegistryValue[];
}
