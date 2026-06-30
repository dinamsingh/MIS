import {
  forwardRef,
  useId,
  useState,
  type ComponentPropsWithoutRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx, disabledState, focusRing } from './utils';

export interface FieldChromeProps {
  readonly label?: ReactNode;
  readonly helperText?: ReactNode;
  readonly error?: ReactNode;
  readonly success?: ReactNode;
  readonly required?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

export function FieldChrome({ label, helperText, error, success, required, className, children }: FieldChromeProps) {
  return (
    <label className={cx('field-group', className)}>
      {label && (
        <span className="field-label">
          {label}
          {required && <span className="ml-1 text-status-red">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="field-error">{error}</span>
      ) : success ? (
        <span className="text-xs font-medium leading-5 text-status-green">{success}</span>
      ) : helperText ? (
        <span className="field-helper">{helperText}</span>
      ) : null}
    </label>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label?: ReactNode;
  readonly helperText?: ReactNode;
  readonly error?: ReactNode;
  readonly success?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helperText, error, success, required, className, ...props },
  ref,
) {
  return (
    <FieldChrome label={label} helperText={helperText} error={error} success={success} required={required}>
      <input
        ref={ref}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        className={cx('input', Boolean(error) && 'border-status-red focus:border-status-red focus:ring-status-red/20', className)}
        {...props}
      />
    </FieldChrome>
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);

  return (
    <FieldChrome label={props.label} helperText={props.helperText} error={props.error} success={props.success} required={props.required}>
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          required={props.required}
          aria-invalid={Boolean(props.error) || undefined}
          className={cx('input pr-20', Boolean(props.error) && 'border-status-red focus:border-status-red focus:ring-status-red/20', props.className)}
          {...stripFieldProps(props)}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className={cx('absolute right-2 top-1/2 -translate-y-1/2 rounded-sm px-2 py-1 text-xs font-medium text-muted hover:bg-secondary hover:text-text', focusRing)}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </FieldChrome>
  );
});

export const SearchInput = forwardRef<HTMLInputElement, InputProps>(function SearchInput({ className, ...props }, ref) {
  return (
    <FieldChrome label={props.label} helperText={props.helperText} error={props.error} success={props.success} required={props.required}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path strokeLinecap="round" d="m21 21-4.35-4.35" />
          </svg>
        </span>
        <input
          ref={ref}
          type="search"
          required={props.required}
          aria-invalid={Boolean(props.error) || undefined}
          className={cx('input pl-9', Boolean(props.error) && 'border-status-red focus:border-status-red focus:ring-status-red/20', className)}
          {...stripFieldProps(props)}
        />
      </div>
    </FieldChrome>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly label?: ReactNode;
  readonly helperText?: ReactNode;
  readonly error?: ReactNode;
  readonly success?: ReactNode;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, helperText, error, success, required, className, ...props },
  ref,
) {
  return (
    <FieldChrome label={label} helperText={helperText} error={error} success={success} required={required}>
      <textarea
        ref={ref}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        className={cx('textarea', Boolean(error) && 'border-status-red focus:border-status-red focus:ring-status-red/20', className)}
        {...props}
      />
    </FieldChrome>
  );
});

export interface SelectOption {
  readonly value: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label?: ReactNode;
  readonly helperText?: ReactNode;
  readonly error?: ReactNode;
  readonly success?: ReactNode;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, helperText, error, success, required, options, placeholder, className, ...props },
  ref,
) {
  return (
    <FieldChrome label={label} helperText={helperText} error={error} success={success} required={required}>
      <select
        ref={ref}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        className={cx('select', Boolean(error) && 'border-status-red focus:border-status-red focus:ring-status-red/20', className)}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldChrome>
  );
});

export interface MultiSelectProps extends Omit<SelectProps, 'value' | 'onChange'> {
  readonly value: readonly string[];
  readonly onChange: (value: string[]) => void;
}

export function MultiSelect({ value, onChange, options, className, ...props }: MultiSelectProps) {
  return (
    <Select
      {...props}
      multiple
      value={value as string[]}
      options={options}
      className={cx('min-h-28 py-2', className)}
      onChange={(event) => {
        const nextValue = Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
        onChange(nextValue);
      }}
    />
  );
}

export interface ChoiceProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: ReactNode;
  readonly helperText?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, ChoiceProps>(function Checkbox(
  { label, helperText, className, ...props },
  ref,
) {
  return (
    <label className={cx('flex items-start gap-3 rounded-control border border-transparent p-1.5 text-sm text-text', props.disabled && 'opacity-60', className)}>
      <input ref={ref} type="checkbox" className={cx('mt-0.5 h-4 w-4 rounded-sm border-input accent-accent', focusRing)} {...props} />
      <span>
        <span className="font-medium">{label}</span>
        {helperText && <span className="block text-xs leading-5 text-muted">{helperText}</span>}
      </span>
    </label>
  );
});

export const Radio = forwardRef<HTMLInputElement, ChoiceProps>(function Radio(
  { label, helperText, className, ...props },
  ref,
) {
  return (
    <label className={cx('flex items-start gap-3 rounded-control border border-transparent p-1.5 text-sm text-text', props.disabled && 'opacity-60', className)}>
      <input ref={ref} type="radio" className={cx('mt-0.5 h-4 w-4 border-input accent-accent', focusRing)} {...props} />
      <span>
        <span className="font-medium">{label}</span>
        {helperText && <span className="block text-xs leading-5 text-muted">{helperText}</span>}
      </span>
    </label>
  );
});

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly label?: ReactNode;
  readonly helperText?: ReactNode;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, helperText, className, ...props },
  ref,
) {
  const id = useId();

  return (
    <label htmlFor={id} className={cx('flex cursor-pointer items-center justify-between gap-3 rounded-control p-1 text-sm', props.disabled && 'cursor-not-allowed opacity-60', className)}>
      <span>
        {label && <span className="font-medium text-text">{label}</span>}
        {helperText && <span className="block text-xs leading-5 text-muted">{helperText}</span>}
      </span>
      <input id={id} ref={ref} type="checkbox" className="peer sr-only" {...props} />
      <span className="relative h-6 w-11 rounded-full bg-border transition-colors duration-fast peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
        <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-surface shadow-soft transition-transform duration-fast peer-checked:translate-x-5" />
      </span>
    </label>
  );
});

export const DatePicker = forwardRef<HTMLInputElement, InputProps>(function DatePicker(props, ref) {
  return <Input ref={ref} type="date" {...props} />;
});

export interface FileUploadProps extends Omit<ComponentPropsWithoutRef<'input'>, 'type'> {
  readonly label?: ReactNode;
  readonly helperText?: ReactNode;
  readonly error?: ReactNode;
  readonly actionLabel?: string;
}

export function FileUpload({ label, helperText, error, actionLabel = 'Choose file', className, ...props }: FileUploadProps) {
  const inputId = useId();

  return (
    <FieldChrome label={label} helperText={helperText} error={error}>
      <div className={cx('rounded-card border border-dashed border-border bg-surface-muted/60 p-4', className)}>
        <input id={inputId} type="file" className="sr-only" {...props} />
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-text">Upload a file</p>
            <p className="text-xs leading-5 text-muted">Drag-and-drop can be added later without changing this base API.</p>
          </div>
          <label htmlFor={inputId} className={cx('btn-secondary min-h-9 cursor-pointer px-3 py-1.5 text-xs', disabledState)}>
            {actionLabel}
          </label>
        </div>
      </div>
    </FieldChrome>
  );
}

function stripFieldProps(props: InputProps): InputHTMLAttributes<HTMLInputElement> {
  const { label: _label, helperText: _helperText, error: _error, success: _success, ...inputProps } = props;
  return inputProps;
}
