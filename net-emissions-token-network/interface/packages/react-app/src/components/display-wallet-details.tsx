import { FC, ReactNode, useContext, useEffect, useState } from "react";
import { Accordion, AccordionContext, Button, Form, OverlayTrigger, Spinner, Tooltip, useAccordionButton } from "react-bootstrap";
import { JsonRpcProvider, Web3Provider } from "@ethersproject/providers";
import { trpcClient } from "../services/trpc";
import { Role, RolesInfo, Wallet } from "./static-data";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { FaRegClipboard } from "react-icons/fa";
import { FormInputRow } from "./forms-util";
import ErrorAlert from "./error-alert";
import { handleFormErrors } from "../services/api.service";
import AsyncButton from "./AsyncButton";

function CustomToggle({
  children,
  eventKey,
}: {
  children: ReactNode;
  eventKey: string;
}) {
  const { activeEventKey } = useContext(AccordionContext);
  const decoratedOnClick = useAccordionButton(eventKey);
  const isCurrentEventKey = activeEventKey === eventKey;

  return (
    <div>
      <span className="me-3">{children}</span>
      {isCurrentEventKey ? (
        <Button
          onClick={decoratedOnClick}
          size="sm"
          variant="outline-secondary"
        >
          Hide
        </Button>
      ) : (
        <Button onClick={decoratedOnClick} size="sm" variant="outline-primary">
          Show
        </Button>
      )}
    </div>
  );
}

function RolesCodesToLi({
  currentRoles,
  roles,
  unregister,
}: {
  currentRoles: RolesInfo;
  roles: string | Role[] | undefined;
  unregister?: (r: Role) => void;
}) {
  if (!roles) return null;
  const arr: Role[] = Array.isArray(roles)
    ? roles
    : (roles.split(",") as Role[]);
  return (
    <>
      {arr.sort().map((r) => (
        <li key={r}>
          {r}
          {unregister &&
            (currentRoles.isAdmin ||
              ((currentRoles.hasDealerRole || currentRoles.hasIndustryRole) &&
                r === "Consumer")) && (
              <Button
                variant="outline-danger"
                className="ms-2 my-1"
                size="sm"
                onClick={() => {
                  unregister(r);
                }}
              >
                Unregister
              </Button>
            )}
        </li>
      ))}
    </>
  );
}

type WalletForm = {
  name: string,
  organization: string,
  email: string,
  error: string,
  success: string,
  loading: string
}
type WalletFormErrors = Partial<WalletForm>

const defaultWalletForm: WalletForm = {
  name: "",
  organization: "",
  email: "",
  error: "",
  success: "",
  loading: ""
} as const;


type Props = {
  provider?: Web3Provider | JsonRpcProvider
  signedInAddress: string
  roles: RolesInfo
  wallet: Wallet | null
  unregisterRoleInContract: (provider: Web3Provider | JsonRpcProvider, address: string, role: Role) => Promise<string | null>
  setWallet: (wallet: Wallet | null) => void
  setError: (error: string) => void
  onSuccess?: () => void
};

const DisplayWalletDetails: FC<Props> = ({
  provider,
  roles,
  wallet,
  unregisterRoleInContract,
  setWallet,
  setError,
  onSuccess
}) => {

  const [form, setForm] = useState<WalletForm>(defaultWalletForm)
  const [formErrors, setFormErrors] = useState<WalletFormErrors>({})

  useEffect(()=>{
    console.log('setting form ?', wallet)
    setForm({
      ...defaultWalletForm,
      ...wallet
    })
  }, [wallet])

  async function handleSingleUnregister(wallet: Wallet, role: Role) {
    if (!provider) return;
    const error = await unregisterRoleInContract(
      provider,
      wallet.address!,
      role
    );
    if (error) {
      setError(error);
      return;
    }
    if (wallet) {
      setWallet(wallet ? {...wallet, roles: wallet.roles?.split(',').filter(r=>r!==role).join(',') } : null);
      setError("");
    }
    if (onSuccess) onSuccess();
  }

  async function handleUpdate() {
    setForm({...form, error:'', loading:'true'})
    setFormErrors({})
    try {
      const payload = {
        address: wallet!.address!,
        name: form.name || '',
        organization: form.organization || '',
        email: form.email || ''
      }
      const message = JSON.stringify(payload)
      const signature = await provider!.getSigner().signMessage(message)
      console.log('posting message', message, signature)
      const data = await trpcClient.mutation('wallet.update', {
        ...payload,
        signature
      })
      console.log('updated',data)
      setForm({...form, loading:''})
    } catch (err) {
      handleFormErrors(err, setFormErrors, setForm)
    }
  }

  return !wallet ? <></> :
    roles?.isAdmin && provider && wallet.address ?
      <Form onSubmit={(e)=>{
        e.preventDefault()
        e.stopPropagation()
        if (e.currentTarget.checkValidity() === false) return
        handleUpdate()
      }}>
        <div className="mb-2"><b>Address</b>: {wallet.address}</div>
        <FormInputRow form={form} setForm={setForm} errors={formErrors} field="name" label="Name" />
        <FormInputRow form={form} setForm={setForm} errors={formErrors} field="organization" label="Organization" />
        <FormInputRow form={form} setForm={setForm} errors={formErrors} field="email" label="Email" />
        {form.error && <ErrorAlert error={form.error} onDismiss={()=>{ setForm({ ...form, error:'' }) }}/>}
        <AsyncButton
          type="submit"
          className="w-100 mb-3"
          variant="success"
          loading={!!form.loading}
        >Update User Information</AsyncButton>
        <ul>

          {wallet.public_key_name && (
            <li><b>Public Key Name</b>: {wallet.public_key_name}</li>
          )}
          {wallet.public_key && (
            <li>
              <Accordion>
                <CustomToggle eventKey="0">
                  <b>Public Key:</b>
                  {/* @ts-ignore : some weird thing with the CopyToClipboard types ... */}
                  <CopyToClipboard text={wallet.public_key_name}>
                    <span className="text-secondary">
                      <OverlayTrigger
                        trigger="click"
                        placement="bottom"
                        rootClose={true}
                        delay={{ show: 250, hide: 400 }}
                        overlay={
                        <Tooltip id="copied-pubkey-tooltip">
                          Copied to clipboard!
                        </Tooltip>
                      }
                      >
                        <sup style={{ cursor: "pointer" }}>
                          &nbsp;
                          <FaRegClipboard />
                        </sup>
                      </OverlayTrigger>
                    </span>
                  </CopyToClipboard>
                </CustomToggle>

                <Accordion.Collapse eventKey="0">
                  <pre>{wallet.public_key}</pre>
                </Accordion.Collapse>
              </Accordion>
            </li>
          )}
          {wallet.roles ? (
            <li>
              <b>Roles:</b>{" "}
              <ul>
                <RolesCodesToLi
                  currentRoles={roles}
                  roles={wallet.roles}
                  unregister={(r) => {
                    handleSingleUnregister(wallet, r);
                  }}
                  />
              </ul>
            </li>
          ) : (
              <li>No roles found.</li>
            )}
        </ul>
      </Form> :
      <ul>
        <li><b>Name:</b> {wallet.name}</li>
        <li><b>Address:</b> {wallet.address}</li>
        {wallet.organization && (
          <li><b>Organization:</b> {wallet.organization}</li>
        )}
        {wallet.public_key_name && (
          <li><b>Public Key Name:</b> {wallet.public_key_name}</li>
        )}
        {wallet.public_key && (
          <li>
            <Accordion>
              <CustomToggle eventKey="0">
                <b>Public Key:</b>
                {/* @ts-ignore : some weird thing with the CopyToClipboard types ... */}
                <CopyToClipboard text={wallet.public_key_name}>
                  <span className="text-secondary">
                    <OverlayTrigger
                      trigger="click"
                      placement="bottom"
                      rootClose={true}
                      delay={{ show: 250, hide: 400 }}
                      overlay={
                      <Tooltip id="copied-pubkey-tooltip">
                        Copied to clipboard!
                      </Tooltip>
                    }
                    >
                      <sup style={{ cursor: "pointer" }}>
                        &nbsp;
                        <FaRegClipboard />
                      </sup>
                    </OverlayTrigger>
                  </span>
                </CopyToClipboard>
              </CustomToggle>

              <Accordion.Collapse eventKey="0">
                <pre>{wallet.public_key}</pre>
              </Accordion.Collapse>
            </Accordion>
          </li>
        )}
        {wallet.roles ? (
          <li>
            <b>Roles:</b>{" "}
            <ul>
              <RolesCodesToLi
                currentRoles={roles}
                roles={wallet.roles}
                unregister={(r) => {
                  handleSingleUnregister(wallet, r);
                }}
                />
            </ul>
          </li>
        ) : (
            <li>No roles found.</li>
          )}
      </ul>
}

export default DisplayWalletDetails;

