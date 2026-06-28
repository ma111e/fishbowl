package data

import "github.com/ma111e/fishbowl/internal/models"

var WellKnownSIDs = map[string]models.SID{
	"S-1-5-1": {
		SID:         "S-1-5-1",
		Name:        "Dialup",
		Description: "A group that includes all users who are signed in to the system via dial-up connection.",
	},
	"S-1-5-113": {
		SID:         "S-1-5-113",
		Name:        "Local account",
		Description: "A SID that you can use when you restrict network sign-in to local accounts instead of administrator or equivalent accounts. This SID can be effective in blocking network sign-in for local users and groups by account type regardless of their name.",
	},
	"S-1-5-114": {
		SID:         "S-1-5-114",
		Name:        "Local account and member of Administrators group",
		Description: "A SID that you can use when you restrict network sign-in to local accounts instead of administrator or equivalent accounts. This SID can be effective in blocking network sign-in for local users and groups by account type regardless of their name.",
	},
	"S-1-5-2": {
		SID:         "S-1-5-2",
		Name:        "Network",
		Description: "A group that includes all users who are signed in via a network connection. Access tokens for interactive users don't contain the Network SID.",
	},
	"S-1-5-3": {
		SID:         "S-1-5-3",
		Name:        "Batch",
		Description: "A group that includes all users who are signed in via batch queue facility, such as task scheduler jobs.",
	},
	"S-1-5-4": {
		SID:         "S-1-5-4",
		Name:        "Interactive",
		Description: "A group that includes all users who sign in interactively. A user can start an interactive sign-in session by opening a Remote Desktop Services connection from a remote computer, or by using a remote shell such as Telnet. In each case, the user's access token contains the Interactive SID. If the user signs in by using a Remote Desktop Services connection, the user's access token also contains the Remote Interactive Logon SID.",
	},
	"S-1-5-5-X-Y": {
		SID:         "S-1-5-5-X-Y",
		Name:        "Logon Session",
		Description: "A particular sign-in session. The X and Y values for SIDs in this format are unique for each sign-in session.",
	},
	"S-1-5-6": {
		SID:         "S-1-5-6",
		Name:        "Service",
		Description: "A group that includes all security principals that are signed in as a service.",
	},
	"S-1-5-7": {
		SID:         "S-1-5-7",
		Name:        "Anonymous Logon",
		Description: "A user who connects to the computer without supplying a user name and password.<br>The Anonymous Logon identity is different from the identity that's used by Internet Information Services (IIS) for anonymous web access. IIS uses an actual account—by default, IUSR_computer-name, for anonymous access to resources on a website. Strictly speaking, such access isn't anonymous, because the security principal is known even though unidentified people are using the account. IUSR_computer-name (or whatever you name the account) has a password, and IIS signs in to the account when the service starts. As a result, the IIS anonymous user is a member of Authenticated Users, but Anonymous Logon isn't.",
	},
	"S-1-5-8": {
		SID:         "S-1-5-8",
		Name:        "Proxy",
		Description: "A SID that's not currently used.",
	},
	"S-1-5-9": {
		SID:         "S-1-5-9",
		Name:        "Enterprise Name Controllers",
		Description: "A group that includes all domain controllers in a forest of domains.",
	},
	"S-1-5-10": {
		SID:         "S-1-5-10",
		Name:        "Self",
		Description: "A placeholder in an ACE for a user, group, or computer object in Active Directory. When you grant permissions to Self, you grant them to the security principal that the object represents. During an access check, the operating system replaces the SID for Self with the SID for the security principal that the object represents.",
	},
	"S-1-5-11": {
		SID:         "S-1-5-11",
		Name:        "Authenticated Users",
		Description: "A group that includes all users and computers with identities that have been authenticated. Authenticated Users doesn't include the Guest account even if that account has a password.<br>This group includes authenticated security principals from any trusted domain, not only the current domain.",
	},
	"S-1-5-12": {
		SID:         "S-1-5-12",
		Name:        "Restricted Code",
		Description: "An identity that's used by a process that's running in a restricted security context. In Windows and Windows Server operating systems, a software restriction policy can assign one of three security levels to code: <br><code>Unrestricted</code><br><code>Restricted</code><br><code>Disallowed</code> <br>When code runs at the restricted security level, the Restricted SID is added to the user's access token.",
	},
	"S-1-5-13": {
		SID:         "S-1-5-13",
		Name:        "Terminal Server User",
		Description: "A group that includes all users who sign in to a server with Remote Desktop Services enabled.",
	},
	"S-1-5-14": {
		SID:         "S-1-5-14",
		Name:        "Remote Interactive Logon",
		Description: "A group that includes all users who sign in to the computer by using a remote desktop connection. This group is a subset of the Interactive group. Access tokens that contain the Remote Interactive Logon SID also contain the Interactive SID.",
	},
	"S-1-5-15": {
		SID:         "S-1-5-15",
		Name:        "This Organization",
		Description: "A group that includes all users from the same organization. This group is included only with Active Directory accounts and added only by a domain controller.",
	},
	"S-1-5-17": {
		SID:         "S-1-5-17",
		Name:        "IUSR",
		Description: "An account that's used by the default IIS user.",
	},
	"S-1-5-18": {
		SID:         "S-1-5-18",
		Name:        "System (or LocalSystem)",
		Description: "An identity that's used locally by the operating system and by services that are configured to sign in as LocalSystem.<br>System is a hidden member of Administrators. That is, any process that's running as System has the SID for the built-in Administrators group in its access token.<br>When a process that's running locally as System accesses network resources, it does so by using the computer's domain identity. Its access token on the remote computer includes the SID for the local computer's domain account plus SIDs for security groups that the computer is a member of, such as Name Computers and Authenticated Users.",
	},
	"S-1-5-19": {
		SID:         "S-1-5-19",
		Name:        "NT Authority (LocalService)",
		Description: "An identity that's used by services that are local to the computer, have no need for extensive local access, and don't need authenticated network access. Services that run as LocalService can access local resources as ordinary users, and they access network resources as anonymous users. As a result, a service that runs as LocalService has significantly less authority than a service that runs as LocalSystem locally and on the network.",
	},
	"S-1-5-20": {
		SID:         "S-1-5-20",
		Name:        "NetworkService",
		Description: "An identity that's used by services that have no need for extensive local access but do need authenticated network access. Services that are running as NetworkService can access local resources as ordinary users and access network resources by using the computer's identity. As a result, a service that runs as NetworkService has the same network access as a service that runs as LocalSystem, but its local access is significantly reduced.",
	},
	"S-1-5-domain-500": {
		SID:         "S-1-5-domain-500",
		Name:        "Administrator",
		Description: "A user account for the system administrator. Every computer has a local Administrator account, and every domain has a domain Administrator account.<br>The Administrator account is the first account created during operating system installation. The account can't be deleted, disabled, or locked out, but it can be renamed.<br>By default, the Administrator account is a member of the Administrators group, and it can't be removed from that group.",
	},
	"S-1-5-domain-501": {
		SID:         "S-1-5-domain-501",
		Name:        "Guest",
		Description: "A user account for people who don't have individual accounts. Every computer has a local Guest account, and every domain has a domain Guest account.<br>By default, Guest is a member of the Everyone and the Guests groups. The domain Guest account is also a member of the Name Guests and Name Users groups.<br>Unlike Anonymous Logon, Guest is a real account, and it can be used to sign in interactively. The Guest account doesn't require a password, but it can have one.",
	},
	"S-1-5-domain-502": {
		SID:         "S-1-5-domain-502",
		Name:        "KRBTGT",
		Description: "A user account that's used by the Key Distribution Center (KDC) service. The account exists only on domain controllers.",
	},
	"S-1-5-domain-512": {
		SID:         "S-1-5-domain-512",
		Name:        "Name Admins",
		Description: "A global group with members that are authorized to administer the domain. By default, the Name Admins group is a member of the Administrators group on all computers that are joined to the domain, including domain controllers.<br>Name Admins is the default owner of any object that's created in the domain's Active Directory by any member of the group. If members of the group create other objects, such as files, the default owner is the Administrators group.",
	},
	"S-1-5-domain-513": {
		SID:         "S-1-5-domain-513",
		Name:        "Name Users",
		Description: "A global group that includes all users in a domain. When you create a new User object in Active Directory, the user is automatically added to this group.",
	},
	"S-1-5-domain-514": {
		SID:         "S-1-5-domain-514",
		Name:        "Name Guests",
		Description: "A global group that, by default, has only one member: the domain's built-in Guest account.",
	},
	"S-1-5-domain-515": {
		SID:         "S-1-5-domain-515",
		Name:        "Name Computers",
		Description: "A global group that includes all computers that are joined to the domain, excluding domain controllers.",
	},
	"S-1-5-domain-516": {
		SID:         "S-1-5-domain-516",
		Name:        "Name Controllers",
		Description: "A global group that includes all domain controllers in the domain. New domain controllers are added to this group automatically.",
	},
	"S-1-5-domain-517": {
		SID:         "S-1-5-domain-517",
		Name:        "Cert Publishers",
		Description: "A global group that includes all computers that host an enterprise certification authority.<br>Cert Publishers are authorized to publish certificates for User objects in Active Directory.",
	},
	"S-1-5-root domain-518": {
		SID:         "S-1-5-root domain-518",
		Name:        "Schema Admins",
		Description: "A group that exists only in the forest root domain. It's a universal group if the domain is in native mode, and it's a global group if the domain is in mixed mode. The Schema Admins group is authorized to make schema changes in Active Directory. By default, the only member of the group is the Administrator account for the forest root domain.",
	},
	"S-1-5-root domain-519": {
		SID:         "S-1-5-root domain-519",
		Name:        "Enterprise Admins",
		Description: "A group that exists only in the forest root domain. It's a universal group if the domain is in native mode, and it's a global group if the domain is in mixed mode.<br>The Enterprise Admins group is authorized to make changes to the forest infrastructure. Examples include adding child domains, configuring sites, authorizing Dynamic Host Configuration Protocol (DHCP) servers, and installing enterprise certification authorities.<br>By default, the only member of Enterprise Admins is the Administrator account for the forest root domain. The group is a default member of every Name Admins group in the forest.",
	},
	"S-1-5-domain-520": {
		SID:         "S-1-5-domain-520",
		Name:        "Group Policy Creator Owners",
		Description: "A global group that's authorized to create new Group Policy Objects in Active Directory. By default, the only member of the group is Administrator.<br>When a member of Group Policy Creator Owners creates an object, that member owns the object. In this way, the Group Policy Creator Owners group is unlike other administrative groups (such as Administrators and Name Admins). When a member of these groups creates an object, the group owns the object, not the individual.",
	},
	"S-1-5-domain-521": {
		SID:         "S-1-5-domain-521",
		Name:        "Read-only Name Controllers",
		Description: "A global group that includes all read-only domain controllers.",
	},
	"S-1-5-domain-522": {
		SID:         "S-1-5-domain-522",
		Name:        "Clonable Controllers",
		Description: "A global group that includes all domain controllers in the domain that can be cloned.",
	},
	"S-1-5-domain-525": {
		SID:         "S-1-5-domain-525",
		Name:        "Protected Users",
		Description: "A global group that's afforded extra protections against authentication security threats.",
	},
	"S-1-5-root domain-526": {
		SID:         "S-1-5-root domain-526",
		Name:        "Key Admins",
		Description: "A group that's intended for use in scenarios where trusted external authorities are responsible for modifying this attribute. Only trusted administrators should be made a member of this group.",
	},
	"S-1-5-domain-527": {
		SID:         "S-1-5-domain-527",
		Name:        "Enterprise Key Admins",
		Description: "A group that's intended for use in scenarios where trusted external authorities are responsible for modifying this attribute. Only trusted enterprise administrators should be made a member of this group.",
	},
	"S-1-5-32-544": {
		SID:         "S-1-5-32-544",
		Name:        "Administrators",
		Description: "A built-in group. After the initial installation of the operating system, the only member of the group is the Administrator account. When a computer joins a domain, the Name Admins group is added to the Administrators group. When a server becomes a domain controller, the Enterprise Admins group also is added to the Administrators group.",
	},
	"S-1-5-32-545": {
		SID:         "S-1-5-32-545",
		Name:        "Users",
		Description: "A built-in group. After the initial installation of the operating system, the only member is the Authenticated Users group.",
	},
	"S-1-5-32-546": {
		SID:         "S-1-5-32-546",
		Name:        "Guests",
		Description: "A built-in group. By default, the only member is the Guest account. The Guests group allows occasional or one-time users to sign in with limited privileges to a computer's built-in Guest account.",
	},
	"S-1-5-32-547": {
		SID:         "S-1-5-32-547",
		Name:        "Power Users",
		Description: "A built-in group. By default, the group has no members. Power users can:<li>Create local users and groups.</li><li>Modify and delete accounts that they create.</li><li>Remove users from the Power Users, Users, and Guests groups.</li><li>Install programs.</li><li>Create, manage, and delete local printers.</li><li>Create and delete file shares.</li>",
	},
	"S-1-5-32-548": {
		SID:         "S-1-5-32-548",
		Name:        "Account Operators",
		Description: "A built-in group that exists only on domain controllers. By default, the group has no members. By default, Account Operators have permission to create, modify, and delete accounts for users, groups, and computers in all containers and organizational units (OUs) of Active Directory except the Builtin container and the Name Controllers OU. Account Operators don't have permission to modify the Administrators and Name Admins groups. They also don't have permission to modify the accounts for members of those groups.",
	},
	"S-1-5-32-549": {
		SID:         "S-1-5-32-549",
		Name:        "Server Operators",
		Description: "A built-in group that exists only on domain controllers. By default, the group has no members. Server Operators can:<li>Sign in to a server interactively.</li><li>Create and delete network shares.</li><li>Start and stop services.</li><li>Back up and restore files.</li><li>Format the hard disk of the computer.</li><li>Shut down the computer.</li>",
	},
	"S-1-5-32-550": {
		SID:         "S-1-5-32-550",
		Name:        "Print Operators",
		Description: "A built-in group that exists only on domain controllers. By default, the only member is the Name Users group. Print Operators can manage printers and document queues.",
	},
	"S-1-5-32-551": {
		SID:         "S-1-5-32-551",
		Name:        "Backup Operators",
		Description: "A built-in group. By default, the group has no members. Backup Operators can back up and restore all files on a computer, regardless of the permissions that protect those files. Backup Operators also can sign in to the computer and shut it down.",
	},
	"S-1-5-32-552": {
		SID:         "S-1-5-32-552",
		Name:        "Replicators",
		Description: "A built-in group that supports file replication in a domain. By default, the group has no members. Don't add users to this group.",
	},
	"S-1-5-domain-553": {
		SID:         "S-1-5-domain-553",
		Name:        "RAS and IAS Servers",
		Description: "A local domain group. By default, this group has no members. Computers that are running the Routing and Remote Access Service are added to the group automatically.<br>Members of this group have access to certain properties of User objects, such as Read Account Restrictions, Read Logon Information, and Read Remote Access Information.",
	},
	"S-1-5-32-554": {
		SID:         "S-1-5-32-554",
		Name:        "Builtin\\Pre-Windows 2000 Compatible Access",
		Description: "A backward compatibility group that allows read access on all users and groups in the domain.",
	},
	"S-1-5-32-555": {
		SID:         "S-1-5-32-555",
		Name:        "Builtin\\Remote Desktop Users",
		Description: "An alias. Members of this group are granted the right to sign in remotely.",
	},
	"S-1-5-32-556": {
		SID:         "S-1-5-32-556",
		Name:        "Builtin\\Network Configuration Operators",
		Description: "An alias. Members of this group can have some administrative privileges to manage configuration of networking features.",
	},
	"S-1-5-32-557": {
		SID:         "S-1-5-32-557",
		Name:        "Builtin\\Incoming Forest Trust Builders",
		Description: "An alias. Members of this group can create incoming, one-way trusts to the forest.",
	},
	"S-1-5-32-558": {
		SID:         "S-1-5-32-558",
		Name:        "Builtin\\Performance Monitor Users",
		Description: "An alias. Members of this group have remote access to monitor the computer.",
	},
	"S-1-5-32-559": {
		SID:         "S-1-5-32-559",
		Name:        "Builtin\\Performance Log Users",
		Description: "An alias. Members of this group have remote access to schedule logging of performance counters on the computer.",
	},
	"S-1-5-32-560": {
		SID:         "S-1-5-32-560",
		Name:        "Builtin\\Windows Authorization Access Group",
		Description: "An alias. Members of this group have access to the computed <code>tokenGroupsGlobalAndUniversal</code> attribute on User objects.",
	},
	"S-1-5-32-561": {
		SID:         "S-1-5-32-561",
		Name:        "Builtin\\Terminal Server License Servers",
		Description: "An alias. A group for Terminal Server license servers.",
	},
	"S-1-5-32-562": {
		SID:         "S-1-5-32-562",
		Name:        "Builtin\\Distributed COM Users",
		Description: "An alias. A group for Component Object Model (COM) users to provide computer-wide access controls that govern access to all call, activation, or launch requests on the computer.",
	},
	"S-1-5-32-568": {
		SID:         "S-1-5-32-568",
		Name:        "Builtin\\IIS_IUSRS",
		Description: "An alias. A built-in group account for IIS users.",
	},
	"S-1-5-32-569": {
		SID:         "S-1-5-32-569",
		Name:        "Builtin\\Cryptographic Operators",
		Description: "A built-in local group. Members are authorized to perform cryptographic operations.",
	},
	"S-1-5-domain-571": {
		SID:         "S-1-5-domain-571",
		Name:        "Allowed RODC Password Replication Group",
		Description: "A group with members who can have their passwords replicated to all read-only domain controllers in the domain.",
	},
	"S-1-5-domain-572": {
		SID:         "S-1-5-domain-572",
		Name:        "Denied RODC Password Replication Group",
		Description: "A group with members who can't have their passwords replicated to all read-only domain controllers in the domain.",
	},
	"S-1-5-32-573": {
		SID:         "S-1-5-32-573",
		Name:        "Builtin\\Event Log Readers",
		Description: "A built-in local group. Members of this group can read event logs from a local computer.",
	},
	"S-1-5-32-574": {
		SID:         "S-1-5-32-574",
		Name:        "Builtin\\Certificate Service DCOM Access",
		Description: "A built-in local group. Members of this group are allowed to connect to certification authorities in the enterprise.",
	},
	"S-1-5-32-575": {
		SID:         "S-1-5-32-575",
		Name:        "Builtin\\RDS Remote Access Servers",
		Description: "A built-in local group. Servers in this group give users of RemoteApp programs and personal virtual desktops access to these resources. In internet-facing deployments, these servers are typically deployed in an edge network. This group needs to be populated on servers that are running Remote Desktop Connection Broker (RD Connection Broker). Remote Desktop Gateway (RD Gateway) servers and Remote Desktop Web Access (RD Web Access) servers used in the deployment need to be in this group.",
	},
	"S-1-5-32-576": {
		SID:         "S-1-5-32-576",
		Name:        "Builtin\\RDS Endpoint Servers",
		Description: "A built-in local group. Servers in this group run virtual machines and host sessions where users' RemoteApp programs and personal virtual desktops run. This group needs to be populated on servers that are running RD Connection Broker. Remote Desktop Session Host (RD Session Host) servers and Remote Desktop Virtualization Host (RD Virtualization Host) servers used in the deployment need to be in this group.",
	},
	"S-1-5-32-577": {
		SID:         "S-1-5-32-577",
		Name:        "Builtin\\RDS Management Servers",
		Description: "A built-in local group. Servers in this group can perform routine administrative actions on servers that are running Remote Desktop Services. This group needs to be populated on all servers in a Remote Desktop Services deployment. The servers that are running the Remote Desktop Services central management service must be included in this group.",
	},
	"S-1-5-32-578": {
		SID:         "S-1-5-32-578",
		Name:        "Builtin\\Hyper-V Administrators",
		Description: "A built-in local group. Members of this group have complete and unrestricted access to all features of Hyper-V.",
	},
	"S-1-5-32-579": {
		SID:         "S-1-5-32-579",
		Name:        "Builtin\\Access Control Assistance Operators",
		Description: "A built-in local group. Members of this group can remotely query authorization attributes and permissions for resources on the computer.",
	},
	"S-1-5-32-580": {
		SID:         "S-1-5-32-580",
		Name:        "Builtin\\Remote Management Users",
		Description: "A built-in local group. Members of this group can access Windows Management Instrumentation (WMI) resources over management protocols such as Web Services for Management (WS-Management) via the Windows Remote Management service. This access applies only to WMI namespaces that grant access to the user.",
	},
	"S-1-5-64-10": {
		SID:         "S-1-5-64-10",
		Name:        "NTLM Authentication",
		Description: "A SID that's used when the New Technology LAN Manager (NTLM) authentication package authenticates the client.",
	},
	"S-1-5-64-14": {
		SID:         "S-1-5-64-14",
		Name:        "SChannel Authentication",
		Description: "A SID that's used when the Secure Channel (Schannel) authentication package authenticates the client.",
	},
	"S-1-5-64-21": {
		SID:         "S-1-5-64-21",
		Name:        "Digest Authentication",
		Description: "A SID that's used when the Digest authentication package authenticates the client.",
	},
	"S-1-5-80": {
		SID:         "S-1-5-80",
		Name:        "NT Service",
		Description: "A SID that's used as a New Technology Service (NT Service) account prefix.",
	},
	"S-1-5-80-0": {
		SID:         "S-1-5-80-0",
		Name:        "All Services",
		Description: "A group that includes all service processes that are configured on the system. The operating system controls the membership of this group. The S-1-5-80-0 SID represents NT SERVICES\\ALL SERVICES.",
	},
	"S-1-5-83-0": {
		SID:         "S-1-5-83-0",
		Name:        "NT VIRTUAL MACHINE\\Virtual Machines",
		Description: "A built-in group. The group is created when the Hyper-V role is installed. The Hyper-V Management Service (VMMS) maintains the membership of this group. This group requires the Create Symbolic Links right (SeCreateSymbolicLinkPrivilege) and the Log on as a Service right (SeServiceLogonRight).",
	},
}

var UniversalWellKnownSIDs = map[string]models.SID{
	"S-1-0-0": {
		SID:         "S-1-0-0",
		Name:        "Null SID",
		Description: "A group with no members. This value is often used when a SID value isn't known.",
	},
	"S-1-1-0": {
		SID:         "S-1-1-0",
		Name:        "World",
		Description: "A group that includes all users.",
	},
	"S-1-2-0": {
		SID:         "S-1-2-0",
		Name:        "Local",
		Description: "Users who sign in to terminals that are locally (physically) connected to the system.",
	},
	"S-1-2-1": {
		SID:         "S-1-2-1",
		Name:        "Console Logon",
		Description: "A group that includes users who are signed in to the physical console.",
	},
	"S-1-3-0": {
		SID:         "S-1-3-0",
		Name:        "Creator Owner ID",
		Description: "A SID to be replaced by the SID of the user who creates a new object. This SID is used in inheritable access control entries (ACEs).",
	},
	"S-1-3-1": {
		SID:         "S-1-3-1",
		Name:        "Creator Group ID",
		Description: "A SID to be replaced by the primary-group SID of the user who creates a new object. Use this SID in inheritable ACEs.",
	},
	"S-1-3-2": {
		SID:         "S-1-3-2",
		Name:        "Owner Server",
		Description: "A placeholder in an inheritable ACE. When the ACE is inherited, the system replaces this SID with the SID for the object's owner server and stores information about who created a given object or file.",
	},
	"S-1-3-3": {
		SID:         "S-1-3-3",
		Name:        "Group Server",
		Description: "A placeholder in an inheritable ACE. When the ACE is inherited, the system replaces this SID with the SID for the object's group server. The system also stores information about the groups that are allowed to work with the object.",
	},
	"S-1-3-4": {
		SID:         "S-1-3-4",
		Name:        "Owner Rights",
		Description: "A group that represents the current owner of the object. When an ACE that carries this SID is applied to an object, the system ignores the implicit READ_CONTROL and WRITE_DAC standard access rights for the object owner.",
	},
	"S-1-4": {
		SID:         "S-1-4",
		Name:        "Non-unique Authority",
		Description: "A SID that represents an identifier authority.",
	},
	"S-1-5": {
		SID:         "S-1-5",
		Name:        "NT Authority",
		Description: "A SID that represents an identifier authority.",
	},
	"S-1-5-80-0": {
		SID:         "S-1-5-80-0",
		Name:        "All Services",
		Description: "A group that includes all service processes configured on the system. The operating system controls the membership of this group.",
	},
}
